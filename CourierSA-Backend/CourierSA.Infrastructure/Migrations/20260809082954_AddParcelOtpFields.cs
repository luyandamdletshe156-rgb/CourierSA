using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddParcelOtpFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OtpCodeHash",
                table: "Parcels",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "OtpGeneratedAt",
                table: "Parcels",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "OtpVerifiedAt",
                table: "Parcels",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresOtpVerification",
                table: "Parcels",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OtpCodeHash",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "OtpGeneratedAt",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "OtpVerifiedAt",
                table: "Parcels");

            migrationBuilder.DropColumn(
                name: "RequiresOtpVerification",
                table: "Parcels");
        }
    }
}
