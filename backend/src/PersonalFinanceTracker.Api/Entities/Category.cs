namespace PersonalFinanceTracker.Api.Entities;

public sealed class Category
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public bool IsArchived { get; set; }
}
