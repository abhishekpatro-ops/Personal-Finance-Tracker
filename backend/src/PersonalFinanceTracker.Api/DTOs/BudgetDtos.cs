namespace PersonalFinanceTracker.Api.DTOs;

public sealed record CreateBudgetRequest(Guid CategoryId, int Month, int Year, decimal Amount, int AlertThresholdPercent);
public sealed record UpdateBudgetRequest(decimal Amount, int AlertThresholdPercent);
