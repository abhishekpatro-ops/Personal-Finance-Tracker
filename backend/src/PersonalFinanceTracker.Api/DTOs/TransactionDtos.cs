namespace PersonalFinanceTracker.Api.DTOs;

public sealed record CreateTransactionRequest(
    Guid AccountId,
    Guid? DestinationAccountId,
    Guid? CategoryId,
    string? CategoryName,
    string Type,
    decimal Amount,
    DateOnly Date,
    string? Merchant,
    string? Note,
    string? PaymentMethod,
    Guid? RecurringTransactionId,
    List<string>? Tags);

public sealed record UpdateTransactionRequest(
    Guid AccountId,
    Guid? DestinationAccountId,
    Guid? CategoryId,
    string? CategoryName,
    string Type,
    decimal Amount,
    DateOnly Date,
    string? Merchant,
    string? Note,
    string? PaymentMethod,
    Guid? RecurringTransactionId,
    List<string>? Tags);

public sealed record ImportTransactionItemRequest(
    Guid? AccountId,
    string? AccountName,
    Guid? DestinationAccountId,
    string? DestinationAccountName,
    Guid? CategoryId,
    string? CategoryName,
    string Type,
    decimal Amount,
    DateOnly Date,
    string? Merchant,
    string? Note,
    string? PaymentMethod,
    Guid? RecurringTransactionId,
    List<string>? Tags);

public sealed record ImportTransactionsRequest(List<ImportTransactionItemRequest> Transactions);
