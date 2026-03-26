using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.Services;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/reports")]
public class ReportsController(AppDbContext db, IAccessControlService accessControl) : ControllerBase
{
    [HttpGet("category-spend")]
    public async Task<IActionResult> GetCategorySpend([FromQuery] DateOnly from, [FromQuery] DateOnly to)
    {
        var userId = User.GetRequiredUserId();
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);

        var report = await db.Transactions
            .Where(t => t.Type == "expense" && accountIds.Contains(t.AccountId) && t.TransactionDate >= from && t.TransactionDate <= to)
            .GroupBy(t => t.CategoryId)
            .Select(g => new { categoryId = g.Key, total = g.Sum(x => x.Amount) })
            .OrderByDescending(x => x.total)
            .ToListAsync();

        return Ok(report);
    }

    [HttpGet("income-vs-expense")]
    public async Task<IActionResult> GetIncomeVsExpense([FromQuery] DateOnly from, [FromQuery] DateOnly to)
    {
        var userId = User.GetRequiredUserId();
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);

        var report = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId) && t.TransactionDate >= from && t.TransactionDate <= to)
            .GroupBy(t => new { t.TransactionDate.Year, t.TransactionDate.Month, t.Type })
            .Select(g => new
            {
                g.Key.Year,
                g.Key.Month,
                g.Key.Type,
                total = g.Sum(x => x.Amount)
            })
            .OrderBy(x => x.Year)
            .ThenBy(x => x.Month)
            .ToListAsync();

        return Ok(report);
    }

    [HttpGet("account-balance-trend")]
    public async Task<IActionResult> GetAccountBalanceTrend()
    {
        var userId = User.GetRequiredUserId();
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);

        var data = await db.Accounts
            .Where(a => accountIds.Contains(a.Id))
            .OrderBy(a => a.Name)
            .Select(a => new { accountId = a.Id, a.Name, a.CurrentBalance, a.LastUpdatedAt })
            .ToListAsync();

        return Ok(data);
    }

    [HttpGet("trends")]
    public async Task<IActionResult> GetTrends([FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] Guid? accountId, [FromQuery] Guid? categoryId)
    {
        var userId = User.GetRequiredUserId();
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);

        if (accountId.HasValue)
        {
            if (!accountIds.Contains(accountId.Value)) return Forbid();
            accountIds = [accountId.Value];
        }

        var query = db.Transactions
            .Where(t => accountIds.Contains(t.AccountId) && t.TransactionDate >= from && t.TransactionDate <= to);

        if (categoryId.HasValue)
        {
            query = query.Where(t => t.CategoryId == categoryId.Value);
        }

        var monthly = await query
            .GroupBy(t => new { t.TransactionDate.Year, t.TransactionDate.Month, t.Type })
            .Select(g => new
            {
                g.Key.Year,
                g.Key.Month,
                g.Key.Type,
                total = g.Sum(x => x.Amount)
            })
            .OrderBy(x => x.Year)
            .ThenBy(x => x.Month)
            .ToListAsync();

        return Ok(monthly);
    }

    [HttpGet("net-worth")]
    public async Task<IActionResult> GetNetWorth([FromQuery] int months = 6)
    {
        months = Math.Clamp(months, 1, 24);

        var userId = User.GetRequiredUserId();
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);
        var now = DateOnly.FromDateTime(DateTime.UtcNow);
        var startMonth = new DateOnly(now.Year, now.Month, 1).AddMonths(-(months - 1));

        var monthlyFlow = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId) && t.TransactionDate >= startMonth && t.TransactionDate <= now)
            .GroupBy(t => new { t.TransactionDate.Year, t.TransactionDate.Month, t.Type })
            .Select(g => new
            {
                g.Key.Year,
                g.Key.Month,
                g.Key.Type,
                total = g.Sum(x => x.Amount)
            })
            .ToListAsync();

        var byMonth = new Dictionary<string, decimal>();
        foreach (var row in monthlyFlow)
        {
            var key = $"{row.Year:D4}-{row.Month:D2}";
            var sign = row.Type == "expense" ? -1 : row.Type == "income" ? 1 : 0;
            byMonth[key] = (byMonth.TryGetValue(key, out var old) ? old : 0m) + (sign * row.total);
        }

        var currentWorth = await db.Accounts
            .Where(a => accountIds.Contains(a.Id))
            .SumAsync(a => (decimal?)a.CurrentBalance) ?? 0m;

        var points = new List<object>();
        var running = currentWorth;
        var monthCursor = new DateOnly(now.Year, now.Month, 1);

        for (var i = 0; i < months; i++)
        {
            var key = $"{monthCursor.Year:D4}-{monthCursor.Month:D2}";
            if (i > 0 && byMonth.TryGetValue(key, out var change))
            {
                running -= change;
            }

            points.Add(new
            {
                year = monthCursor.Year,
                month = monthCursor.Month,
                netWorth = decimal.Round(running, 2)
            });

            monthCursor = monthCursor.AddMonths(-1);
        }

        points.Reverse();
        return Ok(new { currentNetWorth = decimal.Round(currentWorth, 2), points });
    }

    [HttpGet("transactions-pdf")]
    public async Task<IActionResult> DownloadTransactionsPdf([FromQuery] int limit = 30)
    {
        var safeLimit = Math.Clamp(limit, 1, 100);
        var userId = User.GetRequiredUserId();
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId);

        var rows = await (
            from tx in db.Transactions
            where accountIds.Contains(tx.AccountId)
            join category in db.Categories on tx.CategoryId equals category.Id into categoryGroup
            from category in categoryGroup.DefaultIfEmpty()
            orderby tx.TransactionDate descending, tx.CreatedAt descending
            select new
            {
                tx.TransactionDate,
                CategoryName = category != null ? category.Name : "Uncategorized",
                tx.Type,
                tx.Amount
            }
        )
        .Take(safeLimit)
        .ToListAsync();

        var now = DateTime.UtcNow;
        var title = $"Last {safeLimit} Transactions";

        var pdfBytes = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(24);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Column(col =>
                {
                    col.Item().Text("Personal Finance Tracker").SemiBold().FontSize(16);
                    col.Item().Text(title).FontSize(12);
                    col.Item().Text($"Generated on {now:yyyy-MM-dd HH:mm} UTC").FontSize(9).FontColor(Colors.Grey.Darken1);
                });

                page.Content().PaddingVertical(10).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.ConstantColumn(95);
                        columns.RelativeColumn(3);
                        columns.RelativeColumn(2);
                        columns.RelativeColumn(2);
                    });

                    table.Header(header =>
                    {
                        header.Cell().Element(CellHeaderStyle).Text("Date");
                        header.Cell().Element(CellHeaderStyle).Text("Category");
                        header.Cell().Element(CellHeaderStyle).Text("Type");
                        header.Cell().Element(CellHeaderStyle).AlignRight().Text("Amount");
                    });

                    foreach (var row in rows)
                    {
                        table.Cell().Element(CellBodyStyle).Text(row.TransactionDate.ToString("yyyy-MM-dd"));
                        table.Cell().Element(CellBodyStyle).Text(row.CategoryName);
                        table.Cell().Element(CellBodyStyle).Text(row.Type);
                        table.Cell().Element(CellBodyStyle).AlignRight().Text($"{row.Amount:0.00}");
                    }
                });

                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("Page ");
                    x.CurrentPageNumber();
                    x.Span(" of ");
                    x.TotalPages();
                });
            });
        }).GeneratePdf();

        var filename = $"transactions-last-{safeLimit}-{DateTime.UtcNow:yyyyMMddHHmmss}.pdf";
        return File(pdfBytes, "application/pdf", filename);
    }

    private static IContainer CellHeaderStyle(IContainer container)
    {
        return container
            .Background(Colors.Grey.Lighten3)
            .BorderBottom(1)
            .BorderColor(Colors.Grey.Lighten1)
            .PaddingVertical(6)
            .PaddingHorizontal(6)
            .DefaultTextStyle(x => x.SemiBold());
    }

    private static IContainer CellBodyStyle(IContainer container)
    {
        return container
            .BorderBottom(1)
            .BorderColor(Colors.Grey.Lighten2)
            .PaddingVertical(5)
            .PaddingHorizontal(6);
    }
}