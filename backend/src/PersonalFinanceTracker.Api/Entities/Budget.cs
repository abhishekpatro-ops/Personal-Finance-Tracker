namespace PersonalFinanceTracker.Api.Entities;

public sealed class Budget
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid CategoryId { get; set; }
    public int Month { get; set; }
    public int Year { get; set; }
    public decimal Amount { get; set; }
    public int AlertThresholdPercent { get; set; } = 80;
}
