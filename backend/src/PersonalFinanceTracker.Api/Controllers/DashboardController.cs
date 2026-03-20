using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Data;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/dashboard")]
public class DashboardController(AppDbContext db) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var userId = User.GetRequiredUserId();
        var now = DateOnly.FromDateTime(DateTime.UtcNow);

        var monthStart = new DateOnly(now.Year, now.Month, 1);
        var monthEnd = monthStart.AddMonths(1);

        var tx = db.Transactions
            .Where(t => t.UserId == userId && t.TransactionDate >= monthStart && t.TransactionDate < monthEnd);

        var income = await tx.Where(t => t.Type == "income").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var expense = await tx.Where(t => t.Type == "expense").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var net = income - expense;

        var recent = await db.Transactions
            .Where(t => t.UserId == userId)
            .OrderByDescending(t => t.TransactionDate)
            .Take(5)
            .ToListAsync();

        var upcoming = await db.RecurringTransactions
            .Where(r => r.UserId == userId && !r.IsPaused && r.NextRunDate >= now)
            .OrderBy(r => r.NextRunDate)
            .Take(5)
            .ToListAsync();

        return Ok(new
        {
            income,
            expense,
            net,
            recentTransactions = recent,
            upcomingRecurringPayments = upcoming
        });
    }
}
