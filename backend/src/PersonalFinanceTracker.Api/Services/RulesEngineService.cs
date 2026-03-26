using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.Entities;

namespace PersonalFinanceTracker.Api.Services;

public interface IRulesEngineService
{
    Task<RuleExecutionResult> ApplyRulesAsync(
        Guid userId,
        RuleEvaluationContext context,
        Guid? categoryLookupUserId = null,
        CancellationToken cancellationToken = default);
}

public sealed class RuleEvaluationContext
{
    public string Type { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Merchant { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = [];
}

public sealed class RuleExecutionResult
{
    public Guid? CategoryId { get; set; }
    public List<string> Tags { get; set; } = [];
    public List<string> Alerts { get; set; } = [];
}

public sealed class RulesEngineService(AppDbContext db) : IRulesEngineService
{
    public async Task<RuleExecutionResult> ApplyRulesAsync(
        Guid userId,
        RuleEvaluationContext context,
        Guid? categoryLookupUserId = null,
        CancellationToken cancellationToken = default)
    {
        var effectiveLookupUserId = categoryLookupUserId ?? userId;

        var categoryMap = await db.Categories
            .Where(c => c.UserId == effectiveLookupUserId)
            .ToListAsync(cancellationToken);

        var byName = categoryMap
            .GroupBy(c => c.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var byId = categoryMap.ToDictionary(c => c.Id, c => c);

        var result = new RuleExecutionResult
        {
            CategoryId = context.CategoryId,
            Tags = context.Tags.Distinct(StringComparer.OrdinalIgnoreCase).ToList()
        };

        var rules = await db.Rules
            .Where(r => r.UserId == userId && r.IsActive)
            .OrderBy(r => r.Priority)
            .ThenBy(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        foreach (var rule in rules)
        {
            var currentCategoryName = result.CategoryId.HasValue && byId.TryGetValue(result.CategoryId.Value, out var category)
                ? category.Name
                : context.CategoryName;

            if (!Matches(rule.ConditionJson, context, result.CategoryId, currentCategoryName))
            {
                continue;
            }

            ApplyAction(rule.ActionJson, result, byName);
        }

        result.Tags = result.Tags.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        return result;
    }

    private static bool Matches(RuleCondition condition, RuleEvaluationContext context, Guid? categoryId, string categoryName)
    {
        var field = condition.Field?.Trim().ToLowerInvariant();
        var op = condition.Operator?.Trim().ToLowerInvariant();
        var value = condition.Value?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(field) || string.IsNullOrWhiteSpace(op))
        {
            return false;
        }

        return field switch
        {
            "merchant" => CompareString(context.Merchant, op, value),
            "note" => CompareString(context.Note, op, value),
            "type" => CompareString(context.Type, op, value),
            "amount" => CompareNumber(context.Amount, op, value),
            "category_id" => CompareString(categoryId?.ToString() ?? string.Empty, op, value),
            "category" or "category_name" => CompareString(categoryName, op, value),
            _ => false
        };
    }

    private static bool CompareString(string current, string op, string expected)
    {
        var left = current.Trim();
        var right = expected.Trim();

        return op switch
        {
            "equals" => string.Equals(left, right, StringComparison.OrdinalIgnoreCase),
            "contains" => left.Contains(right, StringComparison.OrdinalIgnoreCase),
            "starts_with" => left.StartsWith(right, StringComparison.OrdinalIgnoreCase),
            "ends_with" => left.EndsWith(right, StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }

    private static bool CompareNumber(decimal amount, string op, string expected)
    {
        if (!decimal.TryParse(expected, out var threshold))
        {
            return false;
        }

        return op switch
        {
            "gt" or "greater_than" => amount > threshold,
            "gte" or "greater_or_equal" => amount >= threshold,
            "lt" or "less_than" => amount < threshold,
            "lte" or "less_or_equal" => amount <= threshold,
            "equals" => amount == threshold,
            _ => false
        };
    }

    private static void ApplyAction(RuleAction action, RuleExecutionResult result, Dictionary<string, Category> categoriesByName)
    {
        var type = action.Type?.Trim().ToLowerInvariant();
        var value = action.Value?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(type) || string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        switch (type)
        {
            case "set_category":
                if (Guid.TryParse(value, out var categoryId))
                {
                    result.CategoryId = categoryId;
                }
                else if (categoriesByName.TryGetValue(value, out var category))
                {
                    result.CategoryId = category.Id;
                }
                break;
            case "add_tag":
                result.Tags.Add(value);
                break;
            case "trigger_alert":
                result.Alerts.Add(value);
                break;
        }
    }
}