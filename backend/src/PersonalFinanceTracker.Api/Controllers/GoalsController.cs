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
[Route("api/goals")]
public class GoalsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetRequiredUserId();
        var goals = await db.Goals.Where(g => g.UserId == userId).OrderBy(g => g.TargetDate).ToListAsync();
        return Ok(goals);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateGoalRequest request)
    {
        var cleanName = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(cleanName)) return BadRequest("Goal name is required.");
        if (request.TargetAmount <= 0) return BadRequest("Target amount must be greater than 0.");

        var userId = User.GetRequiredUserId();
        if (request.LinkedAccountId.HasValue)
        {
            var accountExists = await db.Accounts.AnyAsync(a => a.Id == request.LinkedAccountId.Value && a.UserId == userId);
            if (!accountExists) return BadRequest("Selected account not found.");
        }

        var goal = new Goal
        {
            UserId = userId,
            Name = cleanName,
            TargetAmount = request.TargetAmount,
            CurrentAmount = 0,
            TargetDate = request.TargetDate,
            LinkedAccountId = request.LinkedAccountId,
            Icon = SanitizeOptional(request.Icon),
            Color = SanitizeOptional(request.Color),
            Status = "active"
        };

        db.Goals.Add(goal);
        await db.SaveChangesAsync();
        return Ok(goal);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateGoalRequest request)
    {
        var cleanName = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(cleanName)) return BadRequest("Goal name is required.");
        if (request.TargetAmount <= 0) return BadRequest("Target amount must be greater than 0.");
        if (request.CurrentAmount < 0) return BadRequest("Current amount cannot be negative.");

        var status = NormalizeStatus(request.Status);
        if (status is null) return BadRequest("Status must be active or completed.");

        var userId = User.GetRequiredUserId();
        var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return NotFound();

        if (request.LinkedAccountId.HasValue)
        {
            var accountExists = await db.Accounts.AnyAsync(a => a.Id == request.LinkedAccountId.Value && a.UserId == userId);
            if (!accountExists) return BadRequest("Selected account not found.");
        }

        goal.Name = cleanName;
        goal.TargetAmount = request.TargetAmount;
        goal.CurrentAmount = request.CurrentAmount;
        goal.TargetDate = request.TargetDate;
        goal.Status = status;
        goal.LinkedAccountId = request.LinkedAccountId;
        goal.Icon = SanitizeOptional(request.Icon);
        goal.Color = SanitizeOptional(request.Color);

        if (goal.CurrentAmount >= goal.TargetAmount)
        {
            goal.Status = "completed";
        }

        await db.SaveChangesAsync();
        return Ok(goal);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return NotFound();

        db.Goals.Remove(goal);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/contribute")]
    public async Task<IActionResult> Contribute(Guid id, GoalAmountRequest request)
    {
        var userId = User.GetRequiredUserId();
        var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return NotFound();
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");

        var sourceAccountId = request.AccountId ?? goal.LinkedAccountId;
        if (!sourceAccountId.HasValue)
        {
            return BadRequest("No account linked to this goal. Please select an account.");
        }

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == sourceAccountId.Value && a.UserId == userId);
        if (account is null) return BadRequest("Selected account not found.");
        if (account.CurrentBalance < request.Amount) return BadRequest("Insufficient account balance.");

        account.CurrentBalance -= request.Amount;
        account.LastUpdatedAt = DateTime.UtcNow;

        goal.CurrentAmount += request.Amount;
        if (goal.CurrentAmount >= goal.TargetAmount)
        {
            goal.Status = "completed";
        }

        await db.SaveChangesAsync();
        return Ok(goal);
    }

    [HttpPost("{id:guid}/withdraw")]
    public async Task<IActionResult> Withdraw(Guid id, GoalAmountRequest request)
    {
        var userId = User.GetRequiredUserId();
        var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return NotFound();
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");
        if (goal.CurrentAmount < request.Amount) return BadRequest("Cannot withdraw more than current amount.");

        var sourceAccountId = request.AccountId ?? goal.LinkedAccountId;
        if (!sourceAccountId.HasValue)
        {
            return BadRequest("No account linked to this goal. Please select an account.");
        }

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == sourceAccountId.Value && a.UserId == userId);
        if (account is null) return BadRequest("Selected account not found.");

        goal.CurrentAmount -= request.Amount;
        if (goal.Status == "completed" && goal.CurrentAmount < goal.TargetAmount)
        {
            goal.Status = "active";
        }

        account.CurrentBalance += request.Amount;
        account.LastUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(goal);
    }

    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> MarkCompleted(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return NotFound();

        goal.CurrentAmount = goal.TargetAmount;
        goal.Status = "completed";

        await db.SaveChangesAsync();
        return Ok(goal);
    }

    private static string? NormalizeStatus(string raw)
    {
        var value = raw.Trim().ToLowerInvariant();
        return value is "active" or "completed" ? value : null;
    }

    private static string? SanitizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }
}
