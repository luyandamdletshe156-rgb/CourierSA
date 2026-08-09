using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddParcelRescheduleFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "LastRescheduleFeeZAR",
                table: "Parcels",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "OriginalScheduledPickupDate",
                table: "Parcels",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RescheduleCount",
                table: "Parcels",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastRescheduleFeeZAR",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "OriginalScheduledPickupDate",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "RescheduleCount",
                table: "Parcels");
        }
    }
}
