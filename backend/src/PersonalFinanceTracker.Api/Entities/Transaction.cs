namespace PersonalFinanceTracker.Api.Entities;

public sealed class Transaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid AccountId { get; set; }
    public Guid? DestinationAccountId { get; set; }
    public Guid? CategoryId { get; set; }
    public string Type { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateOnly TransactionDate { get; set; }
    public string? Merchant { get; set; }
    public string? Note { get; set; }
    public string? PaymentMethod { get; set; }
    public Guid? RecurringTransactionId { get; set; }
    public List<string> Tags { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
