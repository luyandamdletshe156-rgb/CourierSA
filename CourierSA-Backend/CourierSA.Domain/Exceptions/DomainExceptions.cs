namespace CourierSA.Domain.Exceptions;

public class NotFoundException : Exception { public NotFoundException(string m) : base(m) { } }
public class UnauthorizedException : Exception { public UnauthorizedException(string m) : base(m) { } }
public class ForbiddenException : Exception { public ForbiddenException(string m) : base(m) { } }
public class BadRequestException : Exception { public BadRequestException(string m) : base(m) { } }
public class ConflictException : Exception { public ConflictException(string m) : base(m) { } }

public class ValidationException : Exception
{
    public IEnumerable<string> Errors { get; }
    public ValidationException(IEnumerable<string> errors)
        : base("One or more validation errors occurred.")
        => Errors = errors;
}