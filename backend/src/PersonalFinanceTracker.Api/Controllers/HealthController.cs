using Microsoft.AspNetCore.Mvc;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", service = "PersonalFinanceTracker.Api", at = DateTime.UtcNow });
}
