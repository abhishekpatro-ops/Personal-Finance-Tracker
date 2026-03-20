using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.DTOs;
using PersonalFinanceTracker.Api.Entities;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/budgets")]
public class BudgetsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int month, [FromQuery] int year)
    {
        if (!IsValidMonthYear(month, year)) return BadRequest("Invalid month or year.");

        var userId = User.GetRequiredUserId();
        var budgets = await db.Budgets
            .Where(b => b.UserId == userId && b.Month == month && b.Year == year)
            .ToListAsync();

        return Ok(budgets);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateBudgetRequest request)
    {
        if (!IsValidMonthYear(request.Month, request.Year)) return BadRequest("Invalid month or year.");
        if (request.Amount <= 0) return BadRequest("Budget amount must be greater than 0.");
        if (request.AlertThresholdPercent < 1 || request.AlertThresholdPercent > 120)
        {
            return BadRequest("Alert threshold must be between 1 and 120.");
        }

        var userId = User.GetRequiredUserId();
        var exists = await db.Budgets.AnyAsync(b =>
            b.UserId == userId && b.CategoryId == request.CategoryId && b.Month == request.Month && b.Year == request.Year);

        if (exists) return Conflict("Budget already exists for selected category and month.");

        var budget = new Budget
        {
            UserId = userId,
            CategoryId = request.CategoryId,
            Month = request.Month,
            Year = request.Year,
            Amount = request.Amount,
            AlertThresholdPercent = request.AlertThresholdPercent
        };

        db.Budgets.Add(budget);
        await db.SaveChangesAsync();
        return Ok(budget);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateBudgetRequest request)
    {
        if (request.Amount <= 0) return BadRequest("Budget amount must be greater than 0.");
        if (request.AlertThresholdPercent < 1 || request.AlertThresholdPercent > 120)
        {
            return BadRequest("Alert threshold must be between 1 and 120.");
        }

        var userId = User.GetRequiredUserId();
        var budget = await db.Budgets.FirstOrDefaultAsync(b => b.Id == id && b.UserId == userId);
        if (budget is null) return NotFound();

        budget.Amount = request.Amount;
        budget.AlertThresholdPercent = request.AlertThresholdPercent;
        await db.SaveChangesAsync();

        return Ok(budget);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var budget = await db.Budgets.FirstOrDefaultAsync(b => b.Id == id && b.UserId == userId);
        if (budget is null) return NotFound();

        db.Budgets.Remove(budget);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("duplicate-last-month")]
    public async Task<IActionResult> DuplicateLastMonth([FromQuery] int month, [FromQuery] int year)
    {
        if (!IsValidMonthYear(month, year)) return BadRequest("Invalid month or year.");

        var userId = User.GetRequiredUserId();
        var currentMonth = new DateTime(year, month, 1);
        var prevMonth = currentMonth.AddMonths(-1);

        var previousBudgets = await db.Budgets
            .Where(b => b.UserId == userId && b.Month == prevMonth.Month && b.Year == prevMonth.Year)
            .ToListAsync();

        if (previousBudgets.Count == 0)
        {
            return Ok(new { created = 0, skipped = 0, message = "No budgets found in previous month." });
        }

        var existingCategoryIds = await db.Budgets
            .Where(b => b.UserId == userId && b.Month == month && b.Year == year)
            .Select(b => b.CategoryId)
            .ToListAsync();

        var existingSet = existingCategoryIds.ToHashSet();

        var toCreate = previousBudgets
            .Where(b => !existingSet.Contains(b.CategoryId))
            .Select(b => new Budget
            {
                UserId = userId,
                CategoryId = b.CategoryId,
                Month = month,
                Year = year,
                Amount = b.Amount,
                AlertThresholdPercent = b.AlertThresholdPercent
            })
            .ToList();

        if (toCreate.Count > 0)
        {
            await db.Budgets.AddRangeAsync(toCreate);
            await db.SaveChangesAsync();
        }

        var skipped = previousBudgets.Count - toCreate.Count;
        return Ok(new { created = toCreate.Count, skipped, message = "Budgets duplicated." });
    }

    private static bool IsValidMonthYear(int month, int year)
    {
        return month is >= 1 and <= 12 && year is >= 2000 and <= 2100;
    }
}
