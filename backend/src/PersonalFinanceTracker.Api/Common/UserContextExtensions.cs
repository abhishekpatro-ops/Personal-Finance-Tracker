using System.Security.Claims;

namespace PersonalFinanceTracker.Api.Common;

public static class UserContextExtensions
{
    public static Guid GetRequiredUserId(this ClaimsPrincipal user)
    {
        var id = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(id, out var userId)
            ? userId
            : throw new UnauthorizedAccessException("User id claim missing.");
    }
}
