namespace PersonalFinanceTracker.Api.DTOs;

public sealed record InviteAccountMemberRequest(string Email, string Role);
public sealed record UpdateAccountMemberRoleRequest(string Role);