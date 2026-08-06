using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddParcelIdToInvoice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "InsuranceRequired",
                table: "Quotes",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "ParcelId",
                table: "Invoices",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                collation: "ascii_general_ci");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InsuranceRequired",
                table: "Quotes");

            migrationBuilder.DropColumn(
                name: "ParcelId",
                table: "Invoices");
        }
    }
}
