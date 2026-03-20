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
[Route("api/recurring")]
public class RecurringController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetRequiredUserId();
        var data = await db.RecurringTransactions
            .Where(r => r.UserId == userId)
            .OrderBy(r => r.NextRunDate)
            .ToListAsync();

        return Ok(data);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateRecurringRequest request)
    {
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");

        var userId = User.GetRequiredUserId();
        var recurring = new RecurringTransaction
        {
            UserId = userId,
            Title = request.Title,
            Type = request.Type,
            Amount = request.Amount,
            CategoryId = request.CategoryId,
            AccountId = request.AccountId,
            Frequency = request.Frequency,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            NextRunDate = request.StartDate,
            AutoCreateTransaction = request.AutoCreateTransaction
        };

        db.RecurringTransactions.Add(recurring);
        await db.SaveChangesAsync();
        return Ok(recurring);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateRecurringRequest request)
    {
        var userId = User.GetRequiredUserId();
        var recurring = await db.RecurringTransactions.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
        if (recurring is null) return NotFound();

        recurring.Title = request.Title;
        recurring.Amount = request.Amount;
        recurring.CategoryId = request.CategoryId;
        recurring.AccountId = request.AccountId;
        recurring.Frequency = request.Frequency;
        recurring.StartDate = request.StartDate;
        recurring.EndDate = request.EndDate;
        recurring.NextRunDate = request.NextRunDate;
        recurring.AutoCreateTransaction = request.AutoCreateTransaction;
        recurring.IsPaused = request.IsPaused;

        await db.SaveChangesAsync();
        return Ok(recurring);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var recurring = await db.RecurringTransactions.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
        if (recurring is null) return NotFound();

        db.RecurringTransactions.Remove(recurring);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
