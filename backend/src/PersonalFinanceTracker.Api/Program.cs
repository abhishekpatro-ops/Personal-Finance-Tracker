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
builder.Services.AddScoped<IAccessControlService, AccessControlService>();
builder.Services.AddScoped<IRulesEngineService, RulesEngineService>();
builder.Services.AddScoped<IForecastService, ForecastService>();
builder.Services.AddScoped<IInsightsService, InsightsService>();
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
    db.Database.ExecuteSqlRaw("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL;");
    db.Database.ExecuteSqlRaw("UPDATE transactions SET created_by_user_id = user_id WHERE created_by_user_id IS NULL;");
    db.Database.ExecuteSqlRaw("ALTER TABLE transactions ALTER COLUMN created_by_user_id SET NOT NULL;");

    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS salary_credits (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL,
            year int NOT NULL,
            month int NOT NULL,
            amount numeric(12,2) NOT NULL,
            credited_at timestamp NOT NULL DEFAULT now()
        );");

    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS rules (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL,
            priority int NOT NULL DEFAULT 100,
            name varchar(140) NOT NULL,
            condition_json jsonb NOT NULL,
            action_json jsonb NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
        );");

    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS account_members (
            id uuid PRIMARY KEY,
            account_id uuid NOT NULL references accounts(id) ON DELETE CASCADE,
            user_id uuid NOT NULL references users(id) ON DELETE CASCADE,
            role varchar(20) NOT NULL,
            invited_by_user_id uuid NOT NULL references users(id),
            created_at timestamp NOT NULL DEFAULT now()
        );");

    db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS ix_salary_credits_user_year_month ON salary_credits(user_id, year, month);");
    db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS ix_account_members_account_user ON account_members(account_id, user_id);");
    db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS ix_account_members_user_id ON account_members(user_id);");

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