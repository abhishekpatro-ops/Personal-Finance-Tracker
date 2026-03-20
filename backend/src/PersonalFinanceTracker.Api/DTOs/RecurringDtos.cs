namespace PersonalFinanceTracker.Api.DTOs;

public sealed record CreateRecurringRequest(
    string Title,
    string Type,
    decimal Amount,
    Guid? CategoryId,
    Guid? AccountId,
    string Frequency,
    DateOnly StartDate,
    DateOnly? EndDate,
    bool AutoCreateTransaction);

public sealed record UpdateRecurringRequest(
    string Title,
    decimal Amount,
    Guid? CategoryId,
    Guid? AccountId,
    string Frequency,
    DateOnly StartDate,
    DateOnly? EndDate,
    DateOnly NextRunDate,
    bool AutoCreateTransaction,
    bool IsPaused);
