using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.DTOs;
using PersonalFinanceTracker.Api.Entities;
using PersonalFinanceTracker.Api.Services;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/recurring")]
public class RecurringController(AppDbContext db, IAccessControlService accessControl) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetRequiredUserId();
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);

        var data = await db.RecurringTransactions
            .Where(r => r.UserId == userId || (r.AccountId != null && accountIds.Contains(r.AccountId.Value)))
            .OrderBy(r => r.NextRunDate)
            .ToListAsync();

        return Ok(data);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateRecurringRequest request)
    {
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");

        var actorUserId = User.GetRequiredUserId();
        Guid ownerUserId = actorUserId;

        if (request.AccountId.HasValue)
        {
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.AccountId.Value);
            if (account is null) return BadRequest("Account not found.");

            var canEdit = await accessControl.CanEditAccountAsync(actorUserId, account.Id);
            if (!canEdit) return Forbid();

            ownerUserId = account.UserId;
        }

        var recurring = new RecurringTransaction
        {
            UserId = ownerUserId,
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
        var actorUserId = User.GetRequiredUserId();
        var recurring = await db.RecurringTransactions.FirstOrDefaultAsync(r => r.Id == id);
        if (recurring is null) return NotFound();

        if (recurring.AccountId.HasValue)
        {
            var canEdit = await accessControl.CanEditAccountAsync(actorUserId, recurring.AccountId.Value);
            if (!canEdit) return Forbid();
        }
        else if (recurring.UserId != actorUserId)
        {
            return Forbid();
        }

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
        var actorUserId = User.GetRequiredUserId();
        var recurring = await db.RecurringTransactions.FirstOrDefaultAsync(r => r.Id == id);
        if (recurring is null) return NotFound();

        if (recurring.AccountId.HasValue)
        {
            var canEdit = await accessControl.CanEditAccountAsync(actorUserId, recurring.AccountId.Value);
            if (!canEdit) return Forbid();
        }
        else if (recurring.UserId != actorUserId)
        {
            return Forbid();
        }

        db.RecurringTransactions.Remove(recurring);
        await db.SaveChangesAsync();
        return NoContent();
    }
}