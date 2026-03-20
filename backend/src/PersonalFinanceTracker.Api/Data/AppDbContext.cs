using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Entities;

namespace PersonalFinanceTracker.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<Budget> Budgets => Set<Budget>();
    public DbSet<Goal> Goals => Set<Goal>();
    public DbSet<RecurringTransaction> RecurringTransactions => Set<RecurringTransaction>();
    public DbSet<SalaryCredit> SalaryCredits => Set<SalaryCredit>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(x => x.Email)
            .IsUnique();

        modelBuilder.Entity<Budget>()
            .HasIndex(x => new { x.UserId, x.CategoryId, x.Month, x.Year })
            .IsUnique();

        modelBuilder.Entity<RefreshToken>()
            .HasIndex(x => x.Token)
            .IsUnique();

        modelBuilder.Entity<SalaryCredit>()
            .HasIndex(x => new { x.UserId, x.Year, x.Month })
            .IsUnique();

        modelBuilder.Entity<Transaction>()
            .Property(x => x.Tags)
            .HasColumnType("jsonb");
    }
}
