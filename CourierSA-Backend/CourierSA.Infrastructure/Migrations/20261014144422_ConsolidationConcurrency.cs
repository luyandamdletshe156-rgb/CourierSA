using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ConsolidationConcurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ConsolidationHintSentAt",
                table: "Parcels",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ConsolidationReadySentAt",
                table: "Parcels",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SkipConsolidation",
                table: "Parcels",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ConsolidationPreference",
                table: "CustomerProfiles",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Source",
                table: "ConsolidationOrders",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConsolidationHintSentAt",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "ConsolidationReadySentAt",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "SkipConsolidation",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "ConsolidationPreference",
                table: "CustomerProfiles");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "ConsolidationOrders");
        }
    }
}
