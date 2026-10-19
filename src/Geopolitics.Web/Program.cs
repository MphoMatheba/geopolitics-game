using System.Threading.RateLimiting;
using Geopolitics.Data;
using Geopolitics.Data.Repositories;
using Geopolitics.Engine;
using Geopolitics.Services;
using Geopolitics.Web.Security;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

// Database layer: settings come from user-secrets locally, environment variables in production.
var mongoSettings = builder.Configuration.GetSection("Mongo").Get<MongoSettings>() ?? new MongoSettings();
builder.Services.AddSingleton(new MongoContext(mongoSettings));
builder.Services.AddSingleton<CountryCatalog>();
builder.Services.AddSingleton<IUserRepository, MongoUserRepository>();
builder.Services.AddSingleton<IGameRepository, MongoGameRepository>();
builder.Services.AddSingleton<IEventRepository, MongoEventRepository>();

// AI battle commentary. Without an API key the built-in commentary is used.
var anthropic = builder.Configuration.GetSection("Anthropic").Get<AnthropicSettings>() ?? new AnthropicSettings();
bool aiCommentary = !string.IsNullOrWhiteSpace(anthropic.ApiKey);
if (aiCommentary)
{
    builder.Services.AddSingleton<ICommentator>(_ => new ClaudeCommentator(
        new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(5) })
        {
            Timeout = TimeSpan.FromSeconds(anthropic.TimeoutSeconds)
        },
        anthropic));
}
builder.Services.AddSingleton(sp => new CommentaryService(
    sp.GetService<ICommentator>(),
    TimeSpan.FromSeconds(anthropic.TimeoutSeconds)));

// Game logic.
builder.Services.AddSingleton<IDice, RandomDice>();
builder.Services.AddSingleton<GameService>();

// Accounts and login (cookie authentication).
builder.Services.AddSingleton<AccountService>();
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "geopolitics.auth";
        options.Cookie.HttpOnly = true;                       // not readable by scripts
        options.Cookie.SameSite = SameSiteMode.Lax;           // not sent on cross-site POSTs
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;                      // HTTPS only in production
        options.LoginPath = "/Account/Login";
        options.AccessDeniedPath = "/Account/Login";
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromDays(7);

        // API calls get a plain 401/403 instead of a redirect to the login page.
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            else
                context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
            else
                context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

// Slow down password guessing: 10 sign-up / login attempts per minute per address.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

var app = builder.Build();

// Fail fast, with a clear message, if the database is unreachable.
var ctx = app.Services.GetRequiredService<MongoContext>();
await ctx.PingAsync();
await ctx.EnsureIndexesAsync();
app.Logger.LogInformation("Connected to MongoDB and ensured indexes.");
app.Logger.LogInformation("Battle commentary: {Mode}",
    aiCommentary ? $"Claude ({anthropic.Model})" : "built-in text (no Anthropic API key configured)");

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();   // who is this?
app.UseAuthorization();    // are they allowed?

app.MapStaticAssets();
app.MapControllerRoute(
        name: "default",
        pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.Run();
