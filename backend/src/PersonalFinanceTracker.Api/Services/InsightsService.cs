using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Data;

namespace PersonalFinanceTracker.Api.Services;

public interface IInsightsService
{
    Task<HealthScoreResponse> GetHealthScoreAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<InsightsResponse> GetInsightsAsync(Guid userId, CancellationToken cancellationToken = default);
}

public sealed class HealthScoreResponse
{
    public int Score { get; set; }
    public HealthScoreBreakdown Breakdown { get; set; } = new();
    public List<string> Suggestions { get; set; } = [];
}

public sealed class HealthScoreBreakdown
{
    public decimal SavingsRateScore { get; set; }
    public decimal ExpenseStabilityScore { get; set; }
    public decimal BudgetAdherenceScore { get; set; }
    public decimal CashBufferScore { get; set; }
}

public sealed class InsightsResponse
{
    public List<string> Highlights { get; set; } = [];
    public List<InsightFinding> Findings { get; set; } = [];
}

public sealed class InsightFinding
{
    public string Key { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string ValueText { get; set; } = string.Empty;
    public decimal? ChangePercent { get; set; }
    public string Tone { get; set; } = "neutral";
    public string Description { get; set; } = string.Empty;
}

public sealed class InsightsService(AppDbContext db, IAccessControlService accessControl) : IInsightsService
{
    public async Task<HealthScoreResponse> GetHealthScoreAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId, cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var monthEnd = monthStart.AddMonths(1).AddDays(-1);

        var currentMonthTx = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId)
                && t.TransactionDate >= monthStart
                && t.TransactionDate <= monthEnd)
            .ToListAsync(cancellationToken);

        var income = currentMonthTx.Where(t => t.Type == "income").Sum(t => t.Amount);
        var expense = currentMonthTx.Where(t => t.Type == "expense").Sum(t => t.Amount);

        var savingsRate = income <= 0 ? 0 : (income - expense) / income;
        var savingsRateScore = Clamp01(savingsRate) * 100m;

        var expenseStabilityScore = await GetExpenseStabilityScoreAsync(accountIds, today, cancellationToken);
        var budgetAdherenceScore = await GetBudgetAdherenceScoreAsync(userId, accountIds, today, cancellationToken);
        var cashBufferScore = await GetCashBufferScoreAsync(accountIds, today, cancellationToken);

        var weighted =
            (savingsRateScore * 0.35m) +
            (expenseStabilityScore * 0.25m) +
            (budgetAdherenceScore * 0.2m) +
            (cashBufferScore * 0.2m);

        var suggestions = new List<string>();
        if (savingsRateScore < 50) suggestions.Add("Try reducing non-essential spending to improve your savings rate.");
        if (expenseStabilityScore < 50) suggestions.Add("Your expenses vary a lot month-to-month; consider setting tighter spending limits.");
        if (budgetAdherenceScore < 50) suggestions.Add("You are overshooting budgets in multiple categories this month.");
        if (cashBufferScore < 50) suggestions.Add("Build emergency savings to cover at least 2 months of expenses.");
        if (suggestions.Count == 0) suggestions.Add("Great job. Your financial health indicators look stable.");

        return new HealthScoreResponse
        {
            Score = (int)Math.Round(weighted, MidpointRounding.AwayFromZero),
            Breakdown = new HealthScoreBreakdown
            {
                SavingsRateScore = Round2(savingsRateScore),
                ExpenseStabilityScore = Round2(expenseStabilityScore),
                BudgetAdherenceScore = Round2(budgetAdherenceScore),
                CashBufferScore = Round2(cashBufferScore)
            },
            Suggestions = suggestions
        };
    }

    public async Task<InsightsResponse> GetInsightsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var accountIds = await accessControl.GetAccessibleAccountIdsAsync(userId, cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var thisMonthStart = new DateOnly(today.Year, today.Month, 1);
        var lastMonthStart = thisMonthStart.AddMonths(-1);
        var lastMonthEnd = thisMonthStart.AddDays(-1);

        var thisMonthTx = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId)
                && t.TransactionDate >= thisMonthStart
                && t.TransactionDate <= today)
            .ToListAsync(cancellationToken);

        var lastMonthTx = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId)
                && t.TransactionDate >= lastMonthStart
                && t.TransactionDate <= lastMonthEnd)
            .ToListAsync(cancellationToken);

        var highlights = new List<string>();
        var findings = new List<InsightFinding>();

        var thisMonthFood = await CategorySpendAsync(accountIds, thisMonthStart, today, "food", cancellationToken);
        var lastMonthFood = await CategorySpendAsync(accountIds, lastMonthStart, lastMonthEnd, "food", cancellationToken);

        if (lastMonthFood > 0)
        {
            var delta = ((thisMonthFood - lastMonthFood) / lastMonthFood) * 100m;
            if (Math.Abs(delta) >= 10)
            {
                var direction = delta > 0 ? "increased" : "decreased";
                highlights.Add($"Your food spending {direction} by {Math.Abs(Round2(delta))}% compared to last month.");
            }

            findings.Add(new InsightFinding
            {
                Key = "food_spend",
                Title = "Food Spend",
                ValueText = FormatInr(thisMonthFood),
                ChangePercent = Round2(delta),
                Tone = delta <= 0 ? "positive" : "negative",
                Description = delta >= 0
                    ? "Food expense is higher vs last month."
                    : "Food expense is lower vs last month."
            });
        }

        var thisSavings = thisMonthTx.Where(t => t.Type == "income").Sum(t => t.Amount) - thisMonthTx.Where(t => t.Type == "expense").Sum(t => t.Amount);
        var lastSavings = lastMonthTx.Where(t => t.Type == "income").Sum(t => t.Amount) - lastMonthTx.Where(t => t.Type == "expense").Sum(t => t.Amount);

        if (thisSavings > lastSavings)
        {
            highlights.Add("You saved more than last month.");
        }
        else if (thisSavings < lastSavings)
        {
            highlights.Add("Your savings are lower than last month.");
        }

        var savingsDelta = lastSavings == 0m
            ? (thisSavings == 0m ? 0m : 100m)
            : ((thisSavings - lastSavings) / Math.Abs(lastSavings)) * 100m;

        findings.Add(new InsightFinding
        {
            Key = "savings_delta",
            Title = "Savings Change",
            ValueText = FormatInr(thisSavings),
            ChangePercent = Round2(savingsDelta),
            Tone = thisSavings >= lastSavings ? "positive" : "negative",
            Description = thisSavings >= lastSavings
                ? "You saved more than last month."
                : "You saved less than last month."
        });

        var thisExpense = thisMonthTx.Where(t => t.Type == "expense").Sum(t => t.Amount);
        var lastExpense = lastMonthTx.Where(t => t.Type == "expense").Sum(t => t.Amount);
        var expenseDelta = lastExpense == 0m
            ? (thisExpense == 0m ? 0m : 100m)
            : ((thisExpense - lastExpense) / lastExpense) * 100m;

        findings.Add(new InsightFinding
        {
            Key = "expense_change",
            Title = "Expense Change",
            ValueText = FormatInr(thisExpense),
            ChangePercent = Round2(expenseDelta),
            Tone = expenseDelta <= 0 ? "positive" : "negative",
            Description = expenseDelta <= 0
                ? "Spending came down vs last month."
                : "Spending increased vs last month."
        });

        if (highlights.Count == 0)
        {
            highlights.Add("Spending and savings are stable compared to last month.");
        }

        return new InsightsResponse { Highlights = highlights, Findings = findings };
    }

    private async Task<decimal> GetExpenseStabilityScoreAsync(List<Guid> accountIds, DateOnly today, CancellationToken cancellationToken)
    {
        var start = new DateOnly(today.Year, today.Month, 1).AddMonths(-5);
        var expenses = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId)
                && t.Type == "expense"
                && t.TransactionDate >= start
                && t.TransactionDate <= today)
            .GroupBy(t => new { t.TransactionDate.Year, t.TransactionDate.Month })
            .Select(g => g.Sum(x => x.Amount))
            .ToListAsync(cancellationToken);

        if (expenses.Count < 2)
        {
            return 60m;
        }

        var mean = expenses.Average();
        if (mean <= 0) return 60m;

        var variance = expenses.Average(x => Math.Pow((double)(x - mean), 2));
        var stdDev = (decimal)Math.Sqrt(variance);
        var cv = stdDev / mean;

        return Round2((1m - Clamp01(cv)) * 100m);
    }

    private async Task<decimal> GetBudgetAdherenceScoreAsync(Guid userId, List<Guid> accountIds, DateOnly today, CancellationToken cancellationToken)
    {
        var month = today.Month;
        var year = today.Year;

        var budgets = await db.Budgets
            .Where(b => b.UserId == userId && b.Month == month && b.Year == year)
            .ToListAsync(cancellationToken);

        if (budgets.Count == 0)
        {
            return 70m;
        }

        var monthStart = new DateOnly(year, month, 1);
        var monthEnd = monthStart.AddMonths(1).AddDays(-1);

        var spendByCategory = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId)
                && t.Type == "expense"
                && t.CategoryId != null
                && t.TransactionDate >= monthStart
                && t.TransactionDate <= monthEnd)
            .GroupBy(t => t.CategoryId)
            .Select(g => new { CategoryId = g.Key!.Value, Total = g.Sum(x => x.Amount) })
            .ToDictionaryAsync(x => x.CategoryId, x => x.Total, cancellationToken);

        var totalRatio = 0m;

        foreach (var budget in budgets)
        {
            var spent = spendByCategory.TryGetValue(budget.CategoryId, out var value) ? value : 0m;
            var ratio = budget.Amount <= 0 ? 1m : Math.Min(1m, spent / budget.Amount);
            totalRatio += ratio;
        }

        var avgRatio = totalRatio / budgets.Count;
        return Round2((1m - Math.Max(0, avgRatio - 1m)) * 100m);
    }

    private async Task<decimal> GetCashBufferScoreAsync(List<Guid> accountIds, DateOnly today, CancellationToken cancellationToken)
    {
        var currentBalance = await db.Accounts
            .Where(a => accountIds.Contains(a.Id))
            .SumAsync(a => (decimal?)a.CurrentBalance, cancellationToken) ?? 0m;

        var lookback = today.AddMonths(-3);
        var totalExpense = await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId)
                && t.Type == "expense"
                && t.TransactionDate >= lookback
                && t.TransactionDate <= today)
            .SumAsync(t => (decimal?)t.Amount, cancellationToken) ?? 0m;

        var avgMonthlySpend = totalExpense / 3m;
        if (avgMonthlySpend <= 0)
        {
            return 80m;
        }

        var bufferMonths = currentBalance / avgMonthlySpend;
        return Round2(Math.Min(1m, bufferMonths / 3m) * 100m);
    }

    private async Task<decimal> CategorySpendAsync(List<Guid> accountIds, DateOnly from, DateOnly to, string categoryName, CancellationToken cancellationToken)
    {
        var categoryIds = await db.Categories
            .Where(c => c.Type == "expense" && c.Name.ToLower() == categoryName.ToLower())
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);

        return await db.Transactions
            .Where(t => accountIds.Contains(t.AccountId)
                && t.Type == "expense"
                && t.CategoryId != null
                && categoryIds.Contains(t.CategoryId.Value)
                && t.TransactionDate >= from
                && t.TransactionDate <= to)
            .SumAsync(t => (decimal?)t.Amount, cancellationToken) ?? 0m;
    }

    private static decimal Clamp01(decimal value) => Math.Min(1m, Math.Max(0m, value));
    private static decimal Round2(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    private static string FormatInr(decimal value) => $"INR {Round2(value):N2}";
}
