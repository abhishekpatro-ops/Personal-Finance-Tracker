namespace PersonalFinanceTracker.Api.Services;

public interface ITokenService
{
    string CreateAccessToken(Guid userId, string email, string displayName);
    DateTime GetAccessTokenExpiryUtc();
    string CreateRefreshToken();
}
