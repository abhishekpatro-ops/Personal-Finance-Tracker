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
[Route("api/transactions")]
public class TransactionsController(AppDbContext db, IAccessControlService accessControl, IRulesEngineService rulesEngine) : ControllerBase
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
        var accessibleAccountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);

        var query = db.Transactions.Where(t => accessibleAccountIds.Contains(t.AccountId));

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
        var tx = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id);
        if (tx is null) return NotFound();

        var canView = await accessControl.CanViewAccountAsync(userId, tx.AccountId);
        return !canView ? Forbid() : Ok(tx);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateTransactionRequest request)
    {
        var actorUserId = User.GetRequiredUserId();
        var result = await CreateTransactionInternalAsync(actorUserId, request);
        if (result.ErrorResult is not null) return result.ErrorResult;

        return CreatedAtAction(nameof(GetById), new { id = result.Transaction!.Id }, new { transaction = result.Transaction, alerts = result.Alerts });
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(ImportTransactionsRequest request)
    {
        if (request.Transactions is null || request.Transactions.Count == 0)
        {
            return BadRequest("At least one transaction is required for import.");
        }

        var actorUserId = User.GetRequiredUserId();
        var accessibleAccountIds = await accessControl.GetAccessibleAccountIdsAsync(actorUserId);
        var accessibleAccounts = await db.Accounts
            .Where(a => accessibleAccountIds.Contains(a.Id))
            .ToListAsync();

        var imported = new List<object>();
        var failures = new List<object>();

        for (var i = 0; i < request.Transactions.Count; i++)
        {
            var item = request.Transactions[i];

            var sourceResolution = ResolveImportAccountId(item.AccountId, item.AccountName, accessibleAccounts, "Source account");
            if (sourceResolution.Error is not null || !sourceResolution.AccountId.HasValue)
            {
                failures.Add(new { index = i, error = sourceResolution.Error ?? "Source account is required." });
                continue;
            }

            Guid? destinationAccountId = null;
            if (item.DestinationAccountId.HasValue || !string.IsNullOrWhiteSpace(item.DestinationAccountName))
            {
                var destinationResolution = ResolveImportAccountId(item.DestinationAccountId, item.DestinationAccountName, accessibleAccounts, "Destination account");
                if (destinationResolution.Error is not null)
                {
                    failures.Add(new { index = i, error = destinationResolution.Error });
                    continue;
                }

                destinationAccountId = destinationResolution.AccountId;
            }

            var createRequest = new CreateTransactionRequest(
                sourceResolution.AccountId.Value,
                destinationAccountId,
                item.CategoryId,
                item.CategoryName,
                item.Type,
                item.Amount,
                item.Date,
                item.Merchant,
                item.Note,
                item.PaymentMethod,
                item.RecurringTransactionId,
                item.Tags);

            var result = await CreateTransactionInternalAsync(actorUserId, createRequest);
            if (result.ErrorResult is null && result.Transaction is not null)
            {
                imported.Add(new
                {
                    index = i,
                    transactionId = result.Transaction.Id,
                    alerts = result.Alerts
                });
                continue;
            }

            var message = ResolveErrorMessage(result.ErrorResult);
            failures.Add(new { index = i, error = message });
        }

        return Ok(new
        {
            importedCount = imported.Count,
            failedCount = failures.Count,
            imported,
            failures
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateTransactionRequest request)
    {
        if (request.Amount <= 0) return BadRequest("Amount must be greater than 0.");

        var transactionType = NormalizeType(request.Type);
        if (transactionType is null) return BadRequest("Type must be income, expense, or transfer.");

        var actorUserId = User.GetRequiredUserId();
        var tx = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id);
        if (tx is null) return NotFound();

        var canEditCurrent = await accessControl.CanEditAccountAsync(actorUserId, tx.AccountId);
        if (!canEditCurrent) return Forbid();

        var oldSourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.AccountId);
        if (oldSourceAccount is null) return BadRequest("Source account not found.");

        Account? oldDestinationAccount = null;
        if (tx.DestinationAccountId.HasValue)
        {
            oldDestinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.DestinationAccountId.Value);
            if (oldDestinationAccount is not null)
            {
                var canEditOldDestination = await accessControl.CanEditAccountAsync(actorUserId, oldDestinationAccount.Id);
                if (!canEditOldDestination) return Forbid();
            }
        }

        var newSourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.AccountId);
        if (newSourceAccount is null) return BadRequest("Account not found.");

        var canEditNewSource = await accessControl.CanEditAccountAsync(actorUserId, newSourceAccount.Id);
        if (!canEditNewSource) return Forbid();

        Account? newDestinationAccount = null;
        Guid? categoryId = request.CategoryId;

        if (transactionType == "transfer")
        {
            if (!request.DestinationAccountId.HasValue) return BadRequest("Transfer requires destination account.");
            if (request.DestinationAccountId.Value == request.AccountId) return BadRequest("Source and destination accounts must be different.");
            if (categoryId.HasValue || !string.IsNullOrWhiteSpace(request.CategoryName)) return BadRequest("Transfer should not include category.");

            newDestinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.DestinationAccountId.Value);
            if (newDestinationAccount is null) return BadRequest("Destination account not found.");

            var canEditNewDestination = await accessControl.CanEditAccountAsync(actorUserId, newDestinationAccount.Id);
            if (!canEditNewDestination) return Forbid();
        }
        else
        {
            if (!categoryId.HasValue) return BadRequest("Category is required for income and expense.");

            var categoryValidation = await ValidateTransactionCategoryAsync(newSourceAccount.UserId, categoryId.Value, transactionType);
            if (categoryValidation is not null) return BadRequest(categoryValidation);
        }

        RevertAccountBalanceForDelete(oldSourceAccount, oldDestinationAccount, tx);

        tx.UserId = newSourceAccount.UserId;
        tx.CreatedByUserId = actorUserId;
        tx.AccountId = request.AccountId;
        tx.DestinationAccountId = request.DestinationAccountId;
        tx.CategoryId = categoryId;
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
        var actorUserId = User.GetRequiredUserId();
        var tx = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id);
        if (tx is null) return NotFound();

        var canEdit = await accessControl.CanEditAccountAsync(actorUserId, tx.AccountId);
        if (!canEdit) return Forbid();

        var sourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.AccountId);
        Account? destinationAccount = null;

        if (tx.DestinationAccountId.HasValue)
        {
            destinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == tx.DestinationAccountId.Value);
        }

        if (sourceAccount is not null)
        {
            RevertAccountBalanceForDelete(sourceAccount, destinationAccount, tx);
        }

        db.Transactions.Remove(tx);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<(IActionResult? ErrorResult, Transaction? Transaction, List<string> Alerts)> CreateTransactionInternalAsync(Guid actorUserId, CreateTransactionRequest request)
    {
        if (request.Amount <= 0) return (BadRequest("Amount must be greater than 0."), null, []);

        var transactionType = NormalizeType(request.Type);
        if (transactionType is null) return (BadRequest("Type must be income, expense, or transfer."), null, []);

        var sourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.AccountId);
        if (sourceAccount is null) return (BadRequest("Account not found."), null, []);

        var canEditSource = await accessControl.CanEditAccountAsync(actorUserId, sourceAccount.Id);
        if (!canEditSource) return (Forbid(), null, []);

        Account? destinationAccount = null;
        var categoryId = request.CategoryId;
        var tags = request.Tags ?? [];
        var alerts = new List<string>();

        if (transactionType == "transfer")
        {
            if (!request.DestinationAccountId.HasValue) return (BadRequest("Transfer requires destination account."), null, []);
            if (request.DestinationAccountId.Value == request.AccountId) return (BadRequest("Source and destination accounts must be different."), null, []);
            if (request.CategoryId.HasValue || !string.IsNullOrWhiteSpace(request.CategoryName)) return (BadRequest("Transfer should not include category."), null, []);

            destinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == request.DestinationAccountId.Value);
            if (destinationAccount is null) return (BadRequest("Destination account not found."), null, []);

            var canEditDestination = await accessControl.CanEditAccountAsync(actorUserId, destinationAccount.Id);
            if (!canEditDestination) return (Forbid(), null, []);
        }
        else
        {
            if (!categoryId.HasValue && !string.IsNullOrWhiteSpace(request.CategoryName))
            {
                categoryId = await ResolveCategoryIdByNameAsync(sourceAccount.UserId, request.CategoryName);
            }

            var categoryName = string.Empty;
            if (categoryId.HasValue)
            {
                categoryName = await db.Categories
                    .Where(c => c.Id == categoryId.Value && c.UserId == sourceAccount.UserId)
                    .Select(c => c.Name)
                    .FirstOrDefaultAsync() ?? string.Empty;
            }

            var ruleResult = await rulesEngine.ApplyRulesAsync(actorUserId, new RuleEvaluationContext
            {
                Type = transactionType,
                Amount = request.Amount,
                Merchant = request.Merchant ?? string.Empty,
                Note = request.Note ?? string.Empty,
                CategoryId = categoryId,
                CategoryName = categoryName,
                Tags = tags
            }, sourceAccount.UserId);

            categoryId = ruleResult.CategoryId;
            tags = ruleResult.Tags;
            alerts = ruleResult.Alerts;

            if (!categoryId.HasValue) return (BadRequest("Category is required for income and expense."), null, []);

            var categoryValidation = await ValidateTransactionCategoryAsync(sourceAccount.UserId, categoryId.Value, transactionType);
            if (categoryValidation is not null) return (BadRequest(categoryValidation), null, []);
        }

        var tx = new Transaction
        {
            UserId = sourceAccount.UserId,
            CreatedByUserId = actorUserId,
            AccountId = request.AccountId,
            DestinationAccountId = request.DestinationAccountId,
            CategoryId = categoryId,
            Type = transactionType,
            Amount = request.Amount,
            TransactionDate = request.Date,
            Merchant = request.Merchant,
            Note = request.Note,
            PaymentMethod = request.PaymentMethod,
            RecurringTransactionId = request.RecurringTransactionId,
            Tags = tags
        };

        ApplyAccountBalanceForCreate(sourceAccount, destinationAccount, tx);

        db.Transactions.Add(tx);
        await db.SaveChangesAsync();

        return (null, tx, alerts);
    }

    private static (Guid? AccountId, string? Error) ResolveImportAccountId(
        Guid? accountId,
        string? accountName,
        IReadOnlyCollection<Account> accessibleAccounts,
        string label)
    {
        if (accountId.HasValue)
        {
            var exists = accessibleAccounts.Any(a => a.Id == accountId.Value);
            return exists
                ? (accountId.Value, null)
                : (null, $"{label} not found or inaccessible.");
        }

        if (string.IsNullOrWhiteSpace(accountName))
        {
            return (null, $"{label} is required.");
        }

        var name = accountName.Trim();
        var matches = accessibleAccounts
            .Where(a => string.Equals(a.Name?.Trim(), name, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (matches.Count == 0)
        {
            return (null, $"{label} name '{name}' not found.");
        }

        if (matches.Count > 1)
        {
            return (null, $"{label} name '{name}' is ambiguous. Use accountId instead.");
        }

        return (matches[0].Id, null);
    }
    private static string ResolveErrorMessage(IActionResult? errorResult)
    {
        return errorResult switch
        {
            ObjectResult objectResult when objectResult.Value is string message => message,
            ObjectResult objectResult when objectResult.Value is not null => objectResult.Value.ToString() ?? "Import failed.",
            StatusCodeResult statusCodeResult => $"Import failed with status code {statusCodeResult.StatusCode}.",
            _ => "Import failed."
        };
    }

    private static string? NormalizeType(string rawType)
    {
        var type = rawType.Trim().ToLowerInvariant();
        return type is "income" or "expense" or "transfer" ? type : null;
    }

    private async Task<Guid?> ResolveCategoryIdByNameAsync(Guid ownerUserId, string categoryName)
    {
        var name = categoryName.Trim();
        if (string.IsNullOrWhiteSpace(name)) return null;

        return await db.Categories
            .Where(c => c.UserId == ownerUserId && !c.IsArchived && c.Name.ToLower() == name.ToLower())
            
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync();
    }
    private async Task<string?> ValidateTransactionCategoryAsync(Guid ownerUserId, Guid categoryId, string transactionType)
    {
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == categoryId && c.UserId == ownerUserId);
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






