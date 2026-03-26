using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Services;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/insights")]
public class InsightsController(IInsightsService insightsService) : ControllerBase
{
    [HttpGet("health-score")]
    public async Task<IActionResult> GetHealthScore()
    {
        var userId = User.GetRequiredUserId();
        var data = await insightsService.GetHealthScoreAsync(userId);
        return Ok(data);
    }

    [HttpGet]
    public async Task<IActionResult> GetInsights()
    {
        var userId = User.GetRequiredUserId();
        var data = await insightsService.GetInsightsAsync(userId);
        return Ok(data);
    }
}