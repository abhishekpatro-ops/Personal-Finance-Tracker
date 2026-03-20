namespace PersonalFinanceTracker.Api.Entities;

public sealed class RecurringTransaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public Guid? CategoryId { get; set; }
    public Guid? AccountId { get; set; }
    public string Frequency { get; set; } = "monthly";
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public DateOnly NextRunDate { get; set; }
    public bool AutoCreateTransaction { get; set; } = true;
    public bool IsPaused { get; set; }
}
