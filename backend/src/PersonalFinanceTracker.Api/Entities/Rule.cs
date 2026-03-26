namespace PersonalFinanceTracker.Api.Entities;

public sealed class Rule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public int Priority { get; set; } = 100;
    public string Name { get; set; } = string.Empty;
    public RuleCondition ConditionJson { get; set; } = new();
    public RuleAction ActionJson { get; set; } = new();
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class RuleCondition
{
    public string Field { get; set; } = string.Empty;
    public string Operator { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

public sealed class RuleAction
{
    public string Type { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
