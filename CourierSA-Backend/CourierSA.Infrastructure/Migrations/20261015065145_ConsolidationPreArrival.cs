using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ConsolidationPreArrival : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovedAt",
                table: "ConsolidationOrders",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedByStaffId",
                table: "ConsolidationOrders",
                type: "char(36)",
                nullable: true,
                collation: "ascii_general_ci");

            migrationBuilder.AddColumn<string>(
                name: "ClosedReason",
                table: "ConsolidationOrders",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiresAt",
                table: "ConsolidationOrders",
                type: "datetime(6)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "ConsolidationOrders");

            migrationBuilder.DropColumn(
                name: "ApprovedByStaffId",
                table: "ConsolidationOrders");

            migrationBuilder.DropColumn(
                name: "ClosedReason",
                table: "ConsolidationOrders");

            migrationBuilder.DropColumn(
                name: "ExpiresAt",
                table: "ConsolidationOrders");
        }
    }
}
