namespace PersonalFinanceTracker.Api.Entities;

public sealed class AccountMember
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AccountId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "viewer";
    public Guid InvitedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
