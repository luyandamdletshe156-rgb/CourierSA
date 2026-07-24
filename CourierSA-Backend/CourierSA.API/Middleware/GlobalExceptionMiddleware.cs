using System.Net;
using System.Text.Json;
using CourierSA.Domain.Exceptions;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CourierSA.API.Middleware;

/// <summary>
/// Catches all unhandled exceptions and returns a consistent JSON error envelope.
/// Prevents stack traces leaking to clients in production.
/// </summary>
public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;
    private readonly IWebHostEnvironment _env;

    public GlobalExceptionMiddleware(
        RequestDelegate next,
        ILogger<GlobalExceptionMiddleware> logger,
        IWebHostEnvironment env)
    {
        _next   = next;
        _logger = logger;
        _env    = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception ex)
    {
        _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);

        var (statusCode, message) = ex switch
        {
            NotFoundException       e => (HttpStatusCode.NotFound,           e.Message),
            UnauthorizedException   e => (HttpStatusCode.Unauthorized,       e.Message),
            ForbiddenException      e => (HttpStatusCode.Forbidden,          e.Message),
            BadRequestException     e => (HttpStatusCode.BadRequest,         e.Message),
            ConflictException       e => (HttpStatusCode.Conflict,           e.Message),
            ValidationException     e => (HttpStatusCode.UnprocessableEntity, e.Message),
            _                         => (HttpStatusCode.InternalServerError,
                                          _env.IsDevelopment() ? ex.Message
                                                                : "An unexpected error occurred.")
        };

        context.Response.StatusCode  = (int)statusCode;
        context.Response.ContentType = "application/json";

        var response = new ApiErrorResponse(
            Success: false,
            StatusCode: (int)statusCode,
            Message: message,
            Errors: ex is ValidationException ve ? ve.Errors : null,
            TraceId: context.TraceIdentifier
        );

        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        await context.Response.WriteAsync(json);
    }
}

// ── API Response Wrappers ─────────────────────────────────────────────────────
public record ApiResponse<T>(
    bool    Success,
    int     StatusCode,
    string  Message,
    T?      Data,
    string? TraceId = null);

public record ApiErrorResponse(
    bool    Success,
    int     StatusCode,
    string  Message,
    IEnumerable<string>? Errors,
    string? TraceId = null);

// ── Base Controller ───────────────────────────────────────────────────────────
[ApiController]
[Route("api/[controller]")]
public abstract class CourierSABaseController : ControllerBase
{
    protected Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedException("User ID not found in token."));

    protected string CurrentUserRole =>
        User.FindFirstValue(ClaimTypes.Role)
            ?? throw new UnauthorizedException("Role not found in token.");

    protected IActionResult Ok<T>(T data, string message = "Success")
        => base.Ok(new ApiResponse<T>(true, 200, message, data, HttpContext.TraceIdentifier));

    protected IActionResult Created<T>(T data, string message = "Created successfully")
        => StatusCode(201, new ApiResponse<T>(true, 201, message, data, HttpContext.TraceIdentifier));

    protected IActionResult NoContent(string message = "Operation successful")
        => base.Ok(new ApiResponse<object>(true, 204, message, null, HttpContext.TraceIdentifier));
}
