using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.DTOs;
using PersonalFinanceTracker.Api.Entities;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/rules")]
public class RulesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetRequiredUserId();
        var data = await db.Rules
            .Where(r => r.UserId == userId)
            .OrderBy(r => r.Priority)
            .ThenBy(r => r.CreatedAt)
            .ToListAsync();

        return Ok(data);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateRuleRequest request)
    {
        var error = ValidateRequest(request.Name, request.Priority, request.Condition, request.Action);
        if (error is not null)
        {
            return BadRequest(error);
        }

        var userId = User.GetRequiredUserId();
        var rule = new Rule
        {
            UserId = userId,
            Name = request.Name.Trim(),
            Priority = request.Priority,
            ConditionJson = new RuleCondition
            {
                Field = request.Condition.Field.Trim(),
                Operator = request.Condition.Operator.Trim(),
                Value = request.Condition.Value.Trim()
            },
            ActionJson = new RuleAction
            {
                Type = request.Action.Type.Trim(),
                Value = request.Action.Value.Trim()
            },
            IsActive = request.IsActive
        };

        db.Rules.Add(rule);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { id = rule.Id }, rule);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateRuleRequest request)
    {
        var error = ValidateRequest(request.Name, request.Priority, request.Condition, request.Action);
        if (error is not null)
        {
            return BadRequest(error);
        }

        var userId = User.GetRequiredUserId();
        var rule = await db.Rules.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
        if (rule is null)
        {
            return NotFound();
        }

        rule.Name = request.Name.Trim();
        rule.Priority = request.Priority;
        rule.IsActive = request.IsActive;
        rule.ConditionJson = new RuleCondition
        {
            Field = request.Condition.Field.Trim(),
            Operator = request.Condition.Operator.Trim(),
            Value = request.Condition.Value.Trim()
        };
        rule.ActionJson = new RuleAction
        {
            Type = request.Action.Type.Trim(),
            Value = request.Action.Value.Trim()
        };
        rule.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(rule);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var rule = await db.Rules.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
        if (rule is null)
        {
            return NotFound();
        }

        db.Rules.Remove(rule);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static string? ValidateRequest(string name, int priority, RuleConditionDto condition, RuleActionDto action)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Rule name is required.";
        if (priority < 1 || priority > 1000) return "Priority must be between 1 and 1000.";
        if (string.IsNullOrWhiteSpace(condition.Field)) return "Condition field is required.";
        if (string.IsNullOrWhiteSpace(condition.Operator)) return "Condition operator is required.";
        if (string.IsNullOrWhiteSpace(condition.Value)) return "Condition value is required.";
        if (string.IsNullOrWhiteSpace(action.Type)) return "Action type is required.";
        if (string.IsNullOrWhiteSpace(action.Value)) return "Action value is required.";

        return null;
    }
}