namespace PersonalFinanceTracker.Api.DTOs;

public sealed record CreateGoalRequest(string Name, decimal TargetAmount, DateOnly? TargetDate, Guid? LinkedAccountId, string? Icon, string? Color);
public sealed record UpdateGoalRequest(string Name, decimal TargetAmount, decimal CurrentAmount, DateOnly? TargetDate, string Status, Guid? LinkedAccountId, string? Icon, string? Color);
public sealed record GoalAmountRequest(decimal Amount, Guid? AccountId);
