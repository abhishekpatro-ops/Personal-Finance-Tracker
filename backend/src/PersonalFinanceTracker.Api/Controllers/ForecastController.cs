using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Services;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/forecast")]
public class ForecastController(IForecastService forecastService) : ControllerBase
{
    [HttpGet("month")]
    public async Task<IActionResult> GetMonth()
    {
        var userId = User.GetRequiredUserId();
        var data = await forecastService.GetMonthlyForecastAsync(userId);
        return Ok(data);
    }

    [HttpGet("daily")]
    public async Task<IActionResult> GetDaily()
    {
        var userId = User.GetRequiredUserId();
        var data = await forecastService.GetDailyForecastAsync(userId);
        return Ok(data);
    }
}