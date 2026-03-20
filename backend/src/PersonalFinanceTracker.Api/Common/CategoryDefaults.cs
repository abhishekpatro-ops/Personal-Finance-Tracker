using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.Entities;

namespace PersonalFinanceTracker.Api.Common;

public static class CategoryDefaults
{
    private static readonly (string Name, string Type, string Color, string Icon)[] DefaultCategories =
    [
        ("Food", "expense", "#ef4444", "food"),
        ("Rent", "expense", "#f97316", "home"),
        ("Utilities", "expense", "#f59e0b", "bolt"),
        ("Transport", "expense", "#eab308", "car"),
        ("Entertainment", "expense", "#8b5cf6", "film"),
        ("Shopping", "expense", "#ec4899", "bag"),
        ("Health", "expense", "#06b6d4", "health"),
        ("Education", "expense", "#3b82f6", "book"),
        ("Travel", "expense", "#14b8a6", "travel"),
        ("Subscriptions", "expense", "#6366f1", "subs"),
        ("Miscellaneous", "expense", "#64748b", "misc"),
        ("Salary", "income", "#22c55e", "salary"),
        ("Freelance", "income", "#16a34a", "freelance"),
        ("Bonus", "income", "#84cc16", "bonus"),
        ("Investment", "income", "#10b981", "invest"),
        ("Gift", "income", "#34d399", "gift"),
        ("Refund", "income", "#2dd4bf", "refund"),
        ("Other", "income", "#059669", "other")
    ];

    public static async Task EnsureForUserAsync(AppDbContext db, Guid userId, CancellationToken cancellationToken = default)
    {
        var existingKeys = await db.Categories
            .Where(c => c.UserId == userId)
            .Select(c => new { c.Name, c.Type })
            .ToListAsync(cancellationToken);

        var keySet = existingKeys
            .Select(x => BuildKey(x.Name, x.Type))
            .ToHashSet();

        var toAdd = new List<Category>();

        foreach (var item in DefaultCategories)
        {
            var key = BuildKey(item.Name, item.Type);
            if (keySet.Contains(key)) continue;

            toAdd.Add(new Category
            {
                UserId = userId,
                Name = item.Name,
                Type = item.Type,
                Color = item.Color,
                Icon = item.Icon,
                IsArchived = false
            });
        }

        if (toAdd.Count == 0) return;

        await db.Categories.AddRangeAsync(toAdd, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    private static string BuildKey(string name, string type) =>
        $"{type.Trim().ToLowerInvariant()}|{name.Trim().ToLowerInvariant()}";
}
