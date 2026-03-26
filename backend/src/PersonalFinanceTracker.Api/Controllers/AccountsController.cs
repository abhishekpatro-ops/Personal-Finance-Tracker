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
[Route("api/accounts")]
public class AccountsController(AppDbContext db, IAccessControlService accessControl) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetRequiredUserId();

        var owned = db.Accounts
            .Where(a => a.UserId == userId)
            .Select(a => new
            {
                a.Id,
                a.UserId,
                a.Name,
                a.Type,
                a.OpeningBalance,
                a.CurrentBalance,
                a.IsPrimary,
                a.InstitutionName,
                a.CreatedAt,
                a.LastUpdatedAt,
                accessRole = "owner",
                isShared = false
            });

        var shared =
            from m in db.AccountMembers
            where m.UserId == userId
            join a in db.Accounts on m.AccountId equals a.Id
            select new
            {
                a.Id,
                a.UserId,
                a.Name,
                a.Type,
                a.OpeningBalance,
                a.CurrentBalance,
                a.IsPrimary,
                a.InstitutionName,
                a.CreatedAt,
                a.LastUpdatedAt,
                accessRole = m.Role,
                isShared = true
            };

        var data = await owned
            .Union(shared)
            .OrderByDescending(a => a.IsPrimary)
            .ThenBy(a => a.Name)
            .ToListAsync();

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

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();
        if (account.UserId != userId) return Forbid();

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
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();
        if (account.UserId != userId) return Forbid();

        var linkedTransactions = await db.Transactions
            .Where(t => t.AccountId == id || t.DestinationAccountId == id)
            .ToListAsync();
        if (linkedTransactions.Count > 0) db.Transactions.RemoveRange(linkedTransactions);

        var linkedRecurring = await db.RecurringTransactions.Where(r => r.AccountId == id).ToListAsync();
        if (linkedRecurring.Count > 0) db.RecurringTransactions.RemoveRange(linkedRecurring);

        var members = await db.AccountMembers.Where(m => m.AccountId == id).ToListAsync();
        if (members.Count > 0) db.AccountMembers.RemoveRange(members);

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

        var source = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.SourceAccountId);
        var destination = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.DestinationAccountId);
        if (source is null || destination is null) return BadRequest("Invalid account(s).");

        var canEditSource = await accessControl.CanEditAccountAsync(userId, source.Id);
        var canEditDestination = await accessControl.CanEditAccountAsync(userId, destination.Id);
        if (!canEditSource || !canEditDestination) return Forbid();

        if (source.CurrentBalance < request.Amount) return BadRequest("Insufficient source balance.");

        source.CurrentBalance -= request.Amount;
        destination.CurrentBalance += request.Amount;
        source.LastUpdatedAt = DateTime.UtcNow;
        destination.LastUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(new { message = "Transfer successful" });
    }

    [HttpPost("{id:guid}/invite")]
    public async Task<IActionResult> InviteMember(Guid id, InviteAccountMemberRequest request)
    {
        var ownerUserId = User.GetRequiredUserId();
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound("Account not found.");
        if (account.UserId != ownerUserId) return Forbid();

        var role = NormalizeRole(request.Role);
        if (role is null) return BadRequest("Role must be editor or viewer.");

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var invitedUser = await db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);
        if (invitedUser is null) return NotFound("No user found with this email.");
        if (invitedUser.Id == ownerUserId) return BadRequest("You already own this account.");

        var existing = await db.AccountMembers.FirstOrDefaultAsync(m => m.AccountId == id && m.UserId == invitedUser.Id);
        if (existing is not null)
        {
            existing.Role = role;
            await db.SaveChangesAsync();
            return Ok(new { message = "Member role updated.", member = existing });
        }

        var member = new AccountMember
        {
            AccountId = id,
            UserId = invitedUser.Id,
            Role = role,
            InvitedByUserId = ownerUserId
        };

        db.AccountMembers.Add(member);
        await db.SaveChangesAsync();

        return Ok(new { message = "Member invited successfully.", member });
    }

    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var canView = await accessControl.CanViewAccountAsync(userId, id);
        if (!canView) return Forbid();

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();

        var members = await (
            from m in db.AccountMembers
            where m.AccountId == id
            join u in db.Users on m.UserId equals u.Id
            select new
            {
                m.Id,
                m.AccountId,
                m.UserId,
                userEmail = u.Email,
                userDisplayName = u.DisplayName,
                m.Role,
                m.InvitedByUserId,
                m.CreatedAt
            })
            .OrderBy(m => m.userDisplayName)
            .ToListAsync();

        var owner = await db.Users.FirstOrDefaultAsync(u => u.Id == account.UserId);

        return Ok(new
        {
            accountId = id,
            owner = owner is null ? null : new { userId = owner.Id, userEmail = owner.Email, userDisplayName = owner.DisplayName, role = "owner" },
            members
        });
    }

    [HttpPut("{id:guid}/members/{memberUserId:guid}")]
    public async Task<IActionResult> UpdateMemberRole(Guid id, Guid memberUserId, UpdateAccountMemberRoleRequest request)
    {
        var ownerUserId = User.GetRequiredUserId();
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();
        if (account.UserId != ownerUserId) return Forbid();

        var role = NormalizeRole(request.Role);
        if (role is null) return BadRequest("Role must be editor or viewer.");

        var member = await db.AccountMembers.FirstOrDefaultAsync(m => m.AccountId == id && m.UserId == memberUserId);
        if (member is null) return NotFound("Member not found.");

        member.Role = role;
        await db.SaveChangesAsync();

        return Ok(member);
    }

    [HttpDelete("{id:guid}/members/{memberUserId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberUserId)
    {
        var ownerUserId = User.GetRequiredUserId();
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();
        if (account.UserId != ownerUserId) return Forbid();

        if (memberUserId == ownerUserId)
        {
            return BadRequest("Owner cannot be removed from own account.");
        }

        var member = await db.AccountMembers.FirstOrDefaultAsync(m => m.AccountId == id && m.UserId == memberUserId);
        if (member is null) return NotFound("Member not found.");

        db.AccountMembers.Remove(member);
        await db.SaveChangesAsync();

        return NoContent();
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

    private static string? NormalizeRole(string raw)
    {
        var role = raw.Trim().ToLowerInvariant();
        return role is "editor" or "viewer" ? role : null;
    }

    private static string? SanitizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }
}
