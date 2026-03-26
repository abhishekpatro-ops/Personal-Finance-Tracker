using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Data;

namespace PersonalFinanceTracker.Api.Services;

public interface IAccessControlService
{
    Task<List<Guid>> GetAccessibleAccountIdsAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<bool> CanViewAccountAsync(Guid userId, Guid accountId, CancellationToken cancellationToken = default);
    Task<bool> CanEditAccountAsync(Guid userId, Guid accountId, CancellationToken cancellationToken = default);
    Task<bool> IsOwnerAsync(Guid userId, Guid accountId, CancellationToken cancellationToken = default);
}

public sealed class AccessControlService(AppDbContext db) : IAccessControlService
{
    public async Task<List<Guid>> GetAccessibleAccountIdsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var ownedAccountIds = db.Accounts
            .Where(a => a.UserId == userId)
            .Select(a => a.Id);

        var sharedAccountIds = db.AccountMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.AccountId);

        return await ownedAccountIds
            .Union(sharedAccountIds)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> CanViewAccountAsync(Guid userId, Guid accountId, CancellationToken cancellationToken = default)
    {
        return await db.Accounts.AnyAsync(a => a.Id == accountId && a.UserId == userId, cancellationToken)
            || await db.AccountMembers.AnyAsync(m => m.AccountId == accountId && m.UserId == userId, cancellationToken);
    }

    public async Task<bool> CanEditAccountAsync(Guid userId, Guid accountId, CancellationToken cancellationToken = default)
    {
        if (await IsOwnerAsync(userId, accountId, cancellationToken))
        {
            return true;
        }

        var role = await db.AccountMembers
            .Where(m => m.AccountId == accountId && m.UserId == userId)
            .Select(m => m.Role)
            .FirstOrDefaultAsync(cancellationToken);

        return role is not null && !string.Equals(role, "viewer", StringComparison.OrdinalIgnoreCase);
    }

    public Task<bool> IsOwnerAsync(Guid userId, Guid accountId, CancellationToken cancellationToken = default)
    {
        return db.Accounts.AnyAsync(a => a.Id == accountId && a.UserId == userId, cancellationToken);
    }
}