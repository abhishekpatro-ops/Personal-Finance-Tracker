namespace PersonalFinanceTracker.Api.Entities;

public sealed class SalaryCredit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public int Year { get; set; }
    public int Month { get; set; }
    public decimal Amount { get; set; }
    public DateTime CreditedAt { get; set; } = DateTime.UtcNow;
}
