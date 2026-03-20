using QuestPDF.Infrastructure;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.Jobs;
using PersonalFinanceTracker.Api.Services;

var builder = WebApplication.CreateBuilder(args);
QuestPDF.Settings.License = LicenseType.Community;

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
        policy.WithOrigins(builder.Configuration["Frontend:Url"] ?? "http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

var rawConnectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is missing.");

var csb = new NpgsqlConnectionStringBuilder(rawConnectionString);
Console.WriteLine($"[Startup] ASPNETCORE_ENVIRONMENT={builder.Environment.EnvironmentName}");
Console.WriteLine($"[Startup] DB Host={csb.Host}; Port={csb.Port}; Database={csb.Database}; Username={csb.Username}");

var dataSourceBuilder = new NpgsqlDataSourceBuilder(rawConnectionString);
dataSourceBuilder.EnableDynamicJson();
var dataSource = dataSourceBuilder.Build();

builder.Services.AddSingleton(dataSource);
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(dataSource)
        .UseSnakeCaseNamingConvention());

builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddHostedService<MonthlySalaryCreditJob>();

var jwtKey = builder.Configuration["Jwt:Key"] ?? "super-long-development-jwt-key-change-me";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "PersonalFinanceTracker";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "PersonalFinanceTrackerClient";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    db.Database.ExecuteSqlRaw("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;");
    db.Database.ExecuteSqlRaw("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS destination_account_id uuid NULL;");
    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS salary_credits (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL,
            year int NOT NULL,
            month int NOT NULL,
            amount numeric(12,2) NOT NULL,
            credited_at timestamp NOT NULL DEFAULT now()
        );");
    db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS ix_salary_credits_user_year_month ON salary_credits(user_id, year, month);");

    var usersWithoutPrimary = db.Accounts
        .GroupBy(a => a.UserId)
        .Where(g => !g.Any(x => x.IsPrimary))
        .Select(g => g.OrderBy(x => x.CreatedAt).First())
        .ToList();

    foreach (var account in usersWithoutPrimary)
    {
        if (account.Type == "savings")
        {
            account.IsPrimary = true;
            account.LastUpdatedAt = DateTime.UtcNow;
        }
    }

    db.SaveChanges();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();





