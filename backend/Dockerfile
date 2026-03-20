FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY src/PersonalFinanceTracker.Api/*.csproj src/PersonalFinanceTracker.Api/
RUN dotnet restore src/PersonalFinanceTracker.Api/PersonalFinanceTracker.Api.csproj

COPY src/PersonalFinanceTracker.Api/ src/PersonalFinanceTracker.Api/
RUN dotnet publish src/PersonalFinanceTracker.Api/PersonalFinanceTracker.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "PersonalFinanceTracker.Api.dll"]

