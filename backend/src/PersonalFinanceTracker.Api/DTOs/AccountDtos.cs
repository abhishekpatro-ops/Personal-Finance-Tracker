namespace PersonalFinanceTracker.Api.DTOs;

public sealed record CreateAccountRequest(string Name, string Type, decimal OpeningBalance, bool IsPrimary, string? InstitutionName);
public sealed record UpdateAccountRequest(string Name, string Type, decimal CurrentBalance, bool IsPrimary, string? InstitutionName);
public sealed record AccountTransferRequest(Guid SourceAccountId, Guid DestinationAccountId, decimal Amount);
