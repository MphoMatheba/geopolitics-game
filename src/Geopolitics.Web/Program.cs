using Geopolitics.Data;
using Geopolitics.Data.Repositories;
using Geopolitics.Engine;
using Geopolitics.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

// Database layer: settings come from user-secrets locally, environment variables in production.
var mongoSettings = builder.Configuration.GetSection("Mongo").Get<MongoSettings>() ?? new MongoSettings();
builder.Services.AddSingleton(new MongoContext(mongoSettings));
builder.Services.AddSingleton<CountryCatalog>();
builder.Services.AddSingleton<IUserRepository, MongoUserRepository>();
builder.Services.AddSingleton<IGameRepository, MongoGameRepository>();
builder.Services.AddSingleton<IEventRepository, MongoEventRepository>();

// Game logic.
builder.Services.AddSingleton<IDice, RandomDice>();
builder.Services.AddSingleton<GameService>();

var app = builder.Build();

// Fail fast, with a clear message, if the database is unreachable.
var ctx = app.Services.GetRequiredService<MongoContext>();
await ctx.PingAsync();
await ctx.EnsureIndexesAsync();
app.Logger.LogInformation("Connected to MongoDB and ensured indexes.");

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseAuthorization();

app.MapStaticAssets();
app.MapControllerRoute(
        name: "default",
        pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.Run();
