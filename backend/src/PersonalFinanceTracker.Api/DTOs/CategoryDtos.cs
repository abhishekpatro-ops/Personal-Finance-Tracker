namespace PersonalFinanceTracker.Api.DTOs;

public sealed record CreateCategoryRequest(string Name, string Type, string? Color, string? Icon);
public sealed record UpdateCategoryRequest(string Name, string Type, string? Color, string? Icon, bool IsArchived);
