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
[Route("api/transactions")]
public class TransactionsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] Guid? categoryId,
        [FromQuery] Guid? accountId,
        [FromQuery] string? type,
        [FromQuery] decimal? minAmount,
        [FromQuery] decimal? maxAmount,
        [FromQuery] string? search)
    {
        var userId = User.GetRequiredUserId();
        var query = db.Transactions.Where(t => t.UserId == userId);

        if (from.HasValue) query = query.Where(t => t.TransactionDate >= from);
        if (to.HasValue) query = query.Where(t => t.TransactionDate <= to);
        if (categoryId.HasValue) query = query.Where(t => t.CategoryId == categoryId);
        if (accountId.HasValue) query = query.Where(t => t.AccountId == accountId || t.DestinationAccountId == accountId);
        if (minAmount.HasValue) query = query.Where(t => t.Amount >= minAmount.Value);
        if (maxAmount.HasValue) query = query.Where(t => t.Amount <= maxAmount.Value);

        if (!string.IsNullOrWhiteSpace(type))
        {
            var cleanType = type.Trim().ToLower();
            query = query.Where(t => t.Type == cleanType);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(t => (t.Merchant ?? "").ToLower().Contains(s) || (t.Note ?? "").ToLower().Contains(s));
        }

        var data = await query.OrderByDescending(t => t.TransactionDate).ThenByDescending(t => t.CreatedAt).ToListAsync();
        return Ok(data);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var item = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateTransactionRequest request)
    {
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");

        var transactionType = NormalizeType(request.Type);
        if (transactionType is null) return BadRequest("Type must be income, expense, or transfer.");

        var userId = User.GetRequiredUserId();
        var sourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.AccountId && a.UserId == userId);
        if (sourceAccount is null) return BadRequest("Account not found.");

        Account? destinationAccount = null;

        if (transactionType == "transfer")
        {
            if (!request.DestinationAccountId.HasValue) return BadRequest("Transfer requires destination account.");
            if (request.DestinationAccountId.Value == request.AccountId) return BadRequest("Source and destination accounts must be different.");
            if (request.CategoryId.HasValue) return BadRequest("Transfer should not include category.");

            destinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.DestinationAccountId.Value && a.UserId == userId);
            if (destinationAccount is null) return BadRequest("Destination account not found.");
        }
        else
        {
            if (!request.CategoryId.HasValue) return BadRequest("Category is required for income and expense.");

            var categoryValidation = await ValidateTransactionCategoryAsync(userId, request.CategoryId.Value, transactionType);
            if (categoryValidation is not null) return BadRequest(categoryValidation);
        }

        var tx = new Transaction
        {
            UserId = userId,
            AccountId = request.AccountId,
            DestinationAccountId = request.DestinationAccountId,
            CategoryId = request.CategoryId,
            Type = transactionType,
            Amount = request.Amount,
            TransactionDate = request.Date,
            Merchant = request.Merchant,
            Note = request.Note,
            PaymentMethod = request.PaymentMethod,
            RecurringTransactionId = request.RecurringTransactionId,
            Tags = request.Tags ?? []
        };

        ApplyAccountBalanceForCreate(sourceAccount, destinationAccount, tx);

        db.Transactions.Add(tx);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = tx.Id }, tx);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateTransactionRequest request)
    {
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");

        var transactionType = NormalizeType(request.Type);
        if (transactionType is null) return BadRequest("Type must be income, expense, or transfer.");

        var userId = User.GetRequiredUserId();
        var tx = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (tx is null) return NotFound();

        var oldSourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.AccountId && a.UserId == userId);
        if (oldSourceAccount is null) return BadRequest("Source account not found.");

        Account? oldDestinationAccount = null;
        if (tx.DestinationAccountId.HasValue)
        {
            oldDestinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.DestinationAccountId.Value && a.UserId == userId);
            if (oldDestinationAccount is null) return BadRequest("Destination account not found.");
        }

        var newSourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.AccountId && a.UserId == userId);
        if (newSourceAccount is null) return BadRequest("Account not found.");

        Account? newDestinationAccount = null;

        if (transactionType == "transfer")
        {
            if (!request.DestinationAccountId.HasValue) return BadRequest("Transfer requires destination account.");
            if (request.DestinationAccountId.Value == request.AccountId) return BadRequest("Source and destination accounts must be different.");
            if (request.CategoryId.HasValue) return BadRequest("Transfer should not include category.");

            newDestinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.DestinationAccountId.Value && a.UserId == userId);
            if (newDestinationAccount is null) return BadRequest("Destination account not found.");
        }
        else
        {
            if (!request.CategoryId.HasValue) return BadRequest("Category is required for income and expense.");

            var categoryValidation = await ValidateTransactionCategoryAsync(userId, request.CategoryId.Value, transactionType);
            if (categoryValidation is not null) return BadRequest(categoryValidation);
        }

        RevertAccountBalanceForDelete(oldSourceAccount, oldDestinationAccount, tx);

        tx.AccountId = request.AccountId;
        tx.DestinationAccountId = request.DestinationAccountId;
        tx.CategoryId = request.CategoryId;
        tx.Type = transactionType;
        tx.Amount = request.Amount;
        tx.TransactionDate = request.Date;
        tx.Merchant = request.Merchant;
        tx.Note = request.Note;
        tx.PaymentMethod = request.PaymentMethod;
        tx.RecurringTransactionId = request.RecurringTransactionId;
        tx.Tags = request.Tags ?? [];
        tx.UpdatedAt = DateTime.UtcNow;

        ApplyAccountBalanceForCreate(newSourceAccount, newDestinationAccount, tx);

        await db.SaveChangesAsync();
        return Ok(tx);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var tx = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (tx is null) return NotFound();

        var sourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.AccountId && a.UserId == userId);
        Account? destinationAccount = null;

        if (tx.DestinationAccountId.HasValue)
        {
            destinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.DestinationAccountId.Value && a.UserId == userId);
        }

        if (sourceAccount is not null)
        {
            RevertAccountBalanceForDelete(sourceAccount, destinationAccount, tx);
        }

        db.Transactions.Remove(tx);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static string? NormalizeType(string rawType)
    {
        var type = rawType.Trim().ToLowerInvariant();
        return type is "income" or "expense" or "transfer" ? type : null;
    }

    private async Task<string?> ValidateTransactionCategoryAsync(Guid userId, Guid categoryId, string transactionType)
    {
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == categoryId && c.UserId == userId);
        if (category is null) return "Category not found.";
        if (category.IsArchived) return "Archived categories cannot be used for new transactions.";
        if (!string.Equals(category.Type, transactionType, StringComparison.OrdinalIgnoreCase))
        {
            return "Selected category type does not match transaction type.";
        }

        return null;
    }

    private static void ApplyAccountBalanceForCreate(Account sourceAccount, Account? destinationAccount, Transaction tx)
    {
        var type = tx.Type.ToLowerInvariant();

        if (type == "income")
        {
            sourceAccount.CurrentBalance += tx.Amount;
            sourceAccount.LastUpdatedAt = DateTime.UtcNow;
            return;
        }

        if (type == "expense")
        {
            sourceAccount.CurrentBalance -= tx.Amount;
            sourceAccount.LastUpdatedAt = DateTime.UtcNow;
            return;
        }

        if (type == "transfer" && destinationAccount is not null)
        {
            sourceAccount.CurrentBalance -= tx.Amount;
            destinationAccount.CurrentBalance += tx.Amount;
            sourceAccount.LastUpdatedAt = DateTime.UtcNow;
            destinationAccount.LastUpdatedAt = DateTime.UtcNow;
        }
    }

    private static void RevertAccountBalanceForDelete(Account sourceAccount, Account? destinationAccount, Transaction tx)
    {
        var type = tx.Type.ToLowerInvariant();

        if (type == "income")
        {
            sourceAccount.CurrentBalance -= tx.Amount;
            sourceAccount.LastUpdatedAt = DateTime.UtcNow;
            return;
        }

        if (type == "expense")
        {
            sourceAccount.CurrentBalance += tx.Amount;
            sourceAccount.LastUpdatedAt = DateTime.UtcNow;
            return;
        }

        if (type == "transfer" && destinationAccount is not null)
        {
            sourceAccount.CurrentBalance += tx.Amount;
            destinationAccount.CurrentBalance -= tx.Amount;
            sourceAccount.LastUpdatedAt = DateTime.UtcNow;
            destinationAccount.LastUpdatedAt = DateTime.UtcNow;
        }
    }
}
