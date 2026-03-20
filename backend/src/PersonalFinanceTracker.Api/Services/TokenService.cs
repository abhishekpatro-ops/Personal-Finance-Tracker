using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace PersonalFinanceTracker.Api.Services;

public sealed class TokenService(IConfiguration configuration) : ITokenService
{
    public string CreateAccessToken(Guid userId, string email, string displayName)
    {
        var jwtKey = configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key missing");
        var issuer = configuration["Jwt:Issuer"] ?? "PersonalFinanceTracker";
        var audience = configuration["Jwt:Audience"] ?? "PersonalFinanceTrackerClient";

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Name, displayName)
        };

        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            expires: GetAccessTokenExpiryUtc(),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public DateTime GetAccessTokenExpiryUtc()
    {
        var minutes = int.TryParse(configuration["Jwt:AccessTokenMinutes"], out var value) ? value : 60;
        return DateTime.UtcNow.AddMinutes(minutes);
    }

    public string CreateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes);
    }
}
