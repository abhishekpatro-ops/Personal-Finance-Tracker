namespace PersonalFinanceTracker.Api.DTOs;

public sealed record CreateTransactionRequest(
    Guid AccountId,
    Guid? DestinationAccountId,
    Guid? CategoryId,
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
    string Type,
    decimal Amount,
    DateOnly Date,
    string? Merchant,
    string? Note,
    string? PaymentMethod,
    Guid? RecurringTransactionId,
    List<string>? Tags);
