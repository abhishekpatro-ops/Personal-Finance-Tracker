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
[Route("api/categories")]
public class CategoriesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetRequiredUserId();
        await CategoryDefaults.EnsureForUserAsync(db, userId);

        var categories = await db.Categories
            .Where(c => c.UserId == userId)
            .OrderBy(c => c.Type)
            .ThenBy(c => c.Name)
            .ToListAsync();

        return Ok(categories);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateCategoryRequest request)
    {
        var userId = User.GetRequiredUserId();

        var cleanName = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(cleanName)) return BadRequest("Category name is required.");

        var cleanType = NormalizeType(request.Type);
        if (cleanType is null) return BadRequest("Type must be income or expense.");

        var exists = await db.Categories.AnyAsync(c =>
            c.UserId == userId
            && c.Type == cleanType
            && c.Name.ToLower() == cleanName.ToLower());

        if (exists) return Conflict("Category with this name already exists for selected type.");

        var category = new Category
        {
            UserId = userId,
            Name = cleanName,
            Type = cleanType,
            Color = SanitizeOptional(request.Color),
            Icon = SanitizeOptional(request.Icon)
        };

        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return Ok(category);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateCategoryRequest request)
    {
        var userId = User.GetRequiredUserId();
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
        if (category is null) return NotFound();

        var cleanName = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(cleanName)) return BadRequest("Category name is required.");

        var cleanType = NormalizeType(request.Type);
        if (cleanType is null) return BadRequest("Type must be income or expense.");

        var exists = await db.Categories.AnyAsync(c =>
            c.UserId == userId
            && c.Id != id
            && c.Type == cleanType
            && c.Name.ToLower() == cleanName.ToLower());

        if (exists) return Conflict("Category with this name already exists for selected type.");

        category.Name = cleanName;
        category.Type = cleanType;
        category.Color = SanitizeOptional(request.Color);
        category.Icon = SanitizeOptional(request.Icon);
        category.IsArchived = request.IsArchived;
        await db.SaveChangesAsync();

        return Ok(category);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetRequiredUserId();
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);
        if (category is null) return NotFound();

        db.Categories.Remove(category);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Conflict("Cannot delete category because it is used by existing records.");
        }

        return NoContent();
    }

    private static string? NormalizeType(string rawType)
    {
        var type = rawType.Trim().ToLowerInvariant();
        return type is "income" or "expense" ? type : null;
    }

    private static string? SanitizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }
}
