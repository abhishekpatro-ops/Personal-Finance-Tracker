namespace PersonalFinanceTracker.Api.DTOs;

public sealed record RuleConditionDto(string Field, string Operator, string Value);
public sealed record RuleActionDto(string Type, string Value);

public sealed record CreateRuleRequest(
    string Name,
    int Priority,
    RuleConditionDto Condition,
    RuleActionDto Action,
    bool IsActive);

public sealed record UpdateRuleRequest(
    string Name,
    int Priority,
    RuleConditionDto Condition,
    RuleActionDto Action,
    bool IsActive);