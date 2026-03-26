using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Data;

namespace PersonalFinanceTracker.Api.Services;

public interface IForecastService
{
    Task<MonthlyForecastResponse> GetMonthlyForecastAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<DailyForecastResponse> GetDailyForecastAsync(Guid userId, CancellationToken cancellationToken = default);
}

public sealed class MonthlyForecastResponse
{
    public decimal CurrentBalance { get; set; }
    public decimal ForecastedBalance { get; set; }
    public decimal KnownUpcomingExpenses { get; set; }
    public decimal SafeToSpend { get; set; }
    public List<string> RiskWarnings { get; set; } = [];
}

public sealed class DailyForecastResponse
{
    public List<DailyForecastPoint> Points { get; set; } = [];
    public List<string> RiskWarnings { get; set; } = [];
}

public sealed class DailyForecastPoint
{
    public DateOnly Date { get; set; }
    public decimal ProjectedBalance { get; set; }
}

public sealed class ForecastService(AppDbContext db, IAccessControlService accessControl) : IForecastService
{
    public async Task<MonthlyForecastResponse> GetMonthlyForecastAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var daily = await BuildDailyForecastAsync(userId, cancellationToken);
        var currentBalance = daily.CurrentBalance;
        var finalBalance = daily.Points.LastOrDefault()?.ProjectedBalance ?? currentBalance;
        var knownExpenses = daily.KnownUpcomingExpenses;

        var avgDailyExpense = await GetAverageDailyExpenseAsync(userId, daily.AccountIds, cancellationToken);
        var reserve = avgDailyExpense * 5m;

        return new MonthlyForecastResponse
        {
            CurrentBalance = Round2(currentBalance),
            ForecastedBalance = Round2(finalBalance),
            KnownUpcomingExpenses = Round2(knownExpenses),
            SafeToSpend = Round2(Math.Max(0, finalBalance - reserve)),
            RiskWarnings = daily.RiskWarnings
        };
    }

    public async Task<DailyForecastResponse> GetDailyForecastAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var model = await BuildDailyForecastAsync(userId, cancellationToken);
        return new DailyForecastResponse
        {
            Points = model.Points,
            RiskWarnings = model.RiskWarnings
        };
    }

    private async Task<(List<Guid> AccountIds, decimal CurrentBalance, decimal KnownUpcomingExpenses, List<DailyForecastPoint> Points, List<string> RiskWarnings)> BuildDailyForecastAsync(Guid userId, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var monthEnd = new DateOnly(today.Year, today.Month, DateTime.DaysInMonth(today.Year, today.Month));
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId, cancellationToken);

        var currentBalance = 0m;
        if (accountIds.Count > 0)
        {
            currentBalance = await db.Accounts
                .Where(a => accountIds.Contains(a.Id))
                .SumAsync(a => a.CurrentBalance, cancellationToken);
        }

        var avgDailyNet = await GetAverageDailyNetAsync(userId, accountIds, cancellationToken);

        var recurring = await db.RecurringTransactions
            .Where(r => !r.IsPaused
                && r.AccountId != null
                && accountIds.Contains(r.AccountId.Value)
                && r.NextRunDate >= today
                && r.NextRunDate <= monthEnd)
            .OrderBy(r => r.NextRunDate)
            .ToListAsync(cancellationToken);

        var recurringByDate = recurring
            .GroupBy(r => r.NextRunDate)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(x => x.Type == "income" ? x.Amount : -x.Amount));

        var knownUpcomingExpenses = recurring
            .Where(r => r.Type == "expense")
            .Sum(r => r.Amount);

        var warnings = new List<string>();
        var points = new List<DailyForecastPoint>();

        var runningBalance = currentBalance;
        var hadNegative = runningBalance < 0;

        for (var date = today; date <= monthEnd; date = date.AddDays(1))
        {
            runningBalance += avgDailyNet;
            if (recurringByDate.TryGetValue(date, out var adjustment))
            {
                runningBalance += adjustment;
            }

            points.Add(new DailyForecastPoint
            {
                Date = date,
                ProjectedBalance = Round2(runningBalance)
            });

            if (runningBalance < 0)
            {
                hadNegative = true;
            }
        }

        if (hadNegative)
        {
            warnings.Add("Negative balance likely before month-end.");
        }

        if (accountIds.Count == 0)
        {
            warnings.Add("No accounts available for forecasting.");
        }

        return (accountIds, Round2(currentBalance), Round2(knownUpcomingExpenses), points, warnings);
    }

    private async Task<decimal> GetAverageDailyNetAsync(Guid userId, List<Guid> accountIds, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = today.AddMonths(-3);

        if (accountIds.Count == 0)
        {
            return 0m;
        }

        var tx = await db.Transactions
            .Where(t => t.TransactionDate >= from
                && t.TransactionDate <= today
                && accountIds.Contains(t.AccountId))
            .ToListAsync(cancellationToken);

        var days = Math.Max(1, today.DayNumber - from.DayNumber + 1);

        if (tx.Count == 0)
        {
            return 0m;
        }

        var net = tx.Sum(t => t.Type == "income" ? t.Amount : t.Type == "expense" ? -t.Amount : 0m);
        return net / days;
    }

    private async Task<decimal> GetAverageDailyExpenseAsync(Guid userId, List<Guid> accountIds, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = today.AddMonths(-3);

        if (accountIds.Count == 0)
        {
            return 0m;
        }

        var totalExpense = await db.Transactions
            .Where(t => t.TransactionDate >= from
                && t.TransactionDate <= today
                && t.Type == "expense"
                && accountIds.Contains(t.AccountId))
            .SumAsync(t => (decimal?)t.Amount, cancellationToken) ?? 0m;

        var days = Math.Max(1, today.DayNumber - from.DayNumber + 1);
        return totalExpense / days;
    }

    private static decimal Round2(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}