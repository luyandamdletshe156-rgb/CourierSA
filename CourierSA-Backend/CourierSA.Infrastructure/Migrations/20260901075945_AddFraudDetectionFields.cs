using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFraudDetectionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsRestricted",
                table: "CustomerProfiles",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "RestrictedAt",
                table: "CustomerProfiles",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RestrictedByUserId",
                table: "CustomerProfiles",
                type: "char(36)",
                nullable: true,
                collation: "ascii_general_ci");

            migrationBuilder.AddColumn<string>(
                name: "RestrictionReason",
                table: "CustomerProfiles",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "RiskEvaluatedAt",
                table: "CustomerProfiles",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RiskFactorsJson",
                table: "CustomerProfiles",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "RiskLevel",
                table: "CustomerProfiles",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "RiskScore",
                table: "CustomerProfiles",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsRestricted",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "RestrictedAt",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "RestrictedByUserId",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "RestrictionReason",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "RiskEvaluatedAt",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "RiskFactorsJson",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "RiskLevel",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "RiskScore",
                table: "CustomerProfiles");
        }
    }
}
