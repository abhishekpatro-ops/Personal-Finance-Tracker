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
[Route("api/accounts")]
public class AccountsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetRequiredUserId();
        var data = await db.Accounts.Where(a => a.UserId == userId).OrderByDescending(a => a.IsPrimary).ThenBy(a => a.Name).ToListAsync();
        return Ok(data);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateAccountRequest request)
    {
        var userId = User.GetRequiredUserId();

        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest("Name is required.");
        if (request.OpeningBalance < 0) return BadRequest("Balance cannot be negative.");

        var normalizedType = NormalizeType(request.Type);
        if (normalizedType is null) return BadRequest("Invalid account type.");

        if (request.IsPrimary && normalizedType != "savings")
        {
            return BadRequest("Primary account can only be a savings account.");
        }

        var hasPrimary = await db.Accounts.AnyAsync(a => a.UserId == userId && a.IsPrimary);
        if (request.IsPrimary && hasPrimary)
        {
            return BadRequest("Primary account already exists. You cannot create another primary account.");
        }

        var account = new Account
        {
            UserId = userId,
            Name = request.Name.Trim(),
            Type = normalizedType,
            OpeningBalance = request.OpeningBalance,
            CurrentBalance = request.OpeningBalance,
            InstitutionName = SanitizeOptional(request.InstitutionName),
            IsPrimary = request.IsPrimary && normalizedType == "savings"
        };

        db.Accounts.Add(account);
        await db.SaveChangesAsync();
        return Ok(account);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateAccountRequest request)
    {
        var userId = User.GetRequiredUserId();

        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest("Name is required.");
        if (request.CurrentBalance < 0) return BadRequest("Balance cannot be negative.");

        var normalizedType = NormalizeType(request.Type);
        if (normalizedType is null) return BadRequest("Invalid account type.");

        if (request.IsPrimary && normalizedType != "savings")
        {
            return BadRequest("Primary account can only be a savings account.");
        }

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (account is null) return NotFound();

        if (request.IsPrimary && !account.IsPrimary)
        {
            var hasOtherPrimary = await db.Accounts.AnyAsync(a => a.UserId == userId && a.Id != id && a.IsPrimary);
            if (hasOtherPrimary)
            {
                return BadRequest("Primary account already exists. You cannot set this account as primary.");
            }
        }

        account.Name = request.Name.Trim();
        account.Type = normalizedType;
        account.CurrentBalance = request.CurrentBalance;
        account.IsPrimary = request.IsPrimary && normalizedType == "savings";
        account.InstitutionName = SanitizeOptional(request.InstitutionName);
        account.LastUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(account);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (account is null) return NotFound();

        var linkedTransactions = await db.Transactions
            .Where(t => (t.AccountId == id || t.DestinationAccountId == id) && t.UserId == userId)
            .ToListAsync();
        if (linkedTransactions.Count > 0) db.Transactions.RemoveRange(linkedTransactions);

        var linkedRecurring = await db.RecurringTransactions.Where(r => r.AccountId == id && r.UserId == userId).ToListAsync();
        if (linkedRecurring.Count > 0) db.RecurringTransactions.RemoveRange(linkedRecurring);

        db.Accounts.Remove(account);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("transfer")]
    public async Task<IActionResult> Transfer(AccountTransferRequest request)
    {
        var userId = User.GetRequiredUserId();
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");
        if (request.SourceAccountId == request.DestinationAccountId) return BadRequest("Source and destination accounts must be different.");

        var source = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.SourceAccountId && a.UserId == userId);
        var destination = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.DestinationAccountId && a.UserId == userId);
        if (source is null || destination is null) return BadRequest("Invalid account(s).");
        if (source.CurrentBalance < request.Amount) return BadRequest("Insufficient source balance.");

        source.CurrentBalance -= request.Amount;
        destination.CurrentBalance += request.Amount;
        source.LastUpdatedAt = DateTime.UtcNow;
        destination.LastUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(new { message = "Transfer successful" });
    }

    private static string? NormalizeType(string raw)
    {
        var type = raw.Trim().ToLowerInvariant().Replace("-", "_").Replace(" ", "_");

        return type switch
        {
            "bank" or "bank_account" => "bank",
            "credit_card" => "credit_card",
            "cash" or "cash_wallet" => "cash",
            "savings" or "savings_account" => "savings",
            _ => null
        };
    }

    private static string? SanitizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }
}
