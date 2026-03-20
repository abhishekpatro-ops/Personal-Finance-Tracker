using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.Entities;

namespace PersonalFinanceTracker.Api.Jobs;

public sealed class MonthlySalaryCreditJob(IServiceScopeFactory scopeFactory, ILogger<MonthlySalaryCreditJob> logger) : BackgroundService
{
    private const decimal MonthlySalaryAmount = 100000m;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await CreditSalaryIfDue(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            await CreditSalaryIfDue(stoppingToken);
        }
    }

    private async Task CreditSalaryIfDue(CancellationToken stoppingToken)
    {
        var now = DateTime.UtcNow;
        if (now.Day != 1) return;

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var primaryAccounts = await db.Accounts
            .Where(a => a.IsPrimary)
            .ToListAsync(stoppingToken);

        foreach (var account in primaryAccounts)
        {
            var exists = await db.SalaryCredits.AnyAsync(
                x => x.UserId == account.UserId && x.Year == now.Year && x.Month == now.Month,
                stoppingToken);

            if (exists) continue;

            account.CurrentBalance += MonthlySalaryAmount;
            account.LastUpdatedAt = DateTime.UtcNow;

            var salaryCategory = await db.Categories.FirstOrDefaultAsync(
                c => (c.UserId == null || c.UserId == account.UserId) && c.Type == "income" && c.Name == "Salary",
                stoppingToken);

            db.Transactions.Add(new Transaction
            {
                UserId = account.UserId,
                AccountId = account.Id,
                CategoryId = salaryCategory?.Id,
                Type = "income",
                Amount = MonthlySalaryAmount,
                TransactionDate = new DateOnly(now.Year, now.Month, 1),
                Merchant = "Employer",
                Note = "Monthly salary auto-credit",
                Tags = ["salary", "auto"]
            });

            db.SalaryCredits.Add(new SalaryCredit
            {
                UserId = account.UserId,
                Year = now.Year,
                Month = now.Month,
                Amount = MonthlySalaryAmount,
                CreditedAt = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync(stoppingToken);
        logger.LogInformation("Monthly salary check completed at {AtUtc}", DateTime.UtcNow);
    }
}
