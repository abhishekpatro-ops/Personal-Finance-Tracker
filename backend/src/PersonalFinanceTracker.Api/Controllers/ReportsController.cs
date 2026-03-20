using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Data;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/reports")]
public class ReportsController(AppDbContext db) : ControllerBase
{
    [HttpGet("category-spend")]
    public async Task<IActionResult> GetCategorySpend([FromQuery] DateOnly from, [FromQuery] DateOnly to)
    {
        var userId = User.GetRequiredUserId();

        var report = await db.Transactions
            .Where(t => t.UserId == userId && t.Type == "expense" && t.TransactionDate >= from && t.TransactionDate <= to)
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

        var report = await db.Transactions
            .Where(t => t.UserId == userId && t.TransactionDate >= from && t.TransactionDate <= to)
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

        var data = await db.Accounts
            .Where(a => a.UserId == userId)
            .OrderBy(a => a.Name)
            .Select(a => new { accountId = a.Id, a.Name, a.CurrentBalance, a.LastUpdatedAt })
            .ToListAsync();

        return Ok(data);
    }

    [HttpGet("transactions-pdf")]
    public async Task<IActionResult> DownloadTransactionsPdf([FromQuery] int limit = 30)
    {
        var safeLimit = Math.Clamp(limit, 1, 100);
        var userId = User.GetRequiredUserId();

        var rows = await (
            from tx in db.Transactions
            where tx.UserId == userId
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
